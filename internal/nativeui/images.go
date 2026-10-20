package nativeui

import (
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"sync"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
	_ "golang.org/x/image/bmp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// imageCache keeps decoded bitmaps in a byte-bounded LRU. Bitmaps are made on
// the main thread; decoding and scaling happen on workers.
type imageCache struct {
	mu      sync.Mutex
	entries map[string]*imageEntry
	max     int
	budget  int64
	bytes   int64
	tick    uint64
}

type imageEntry struct {
	bmp     *ui.Bitmap
	used    uint64
	loading bool
	failed  bool
	bytes   int64
}

func newImageCache(max int, budget int64) *imageCache {
	return &imageCache{entries: map[string]*imageEntry{}, max: max, budget: budget}
}

// get returns a ready bitmap and marks it recently used.
func (c *imageCache) get(key string) *ui.Bitmap {
	c.mu.Lock()
	defer c.mu.Unlock()
	e := c.entries[key]
	if e == nil {
		return nil
	}
	c.tick++
	e.used = c.tick
	return e.bmp
}

// begin reserves a load slot for key. It reports false when the key is loading,
// ready, or known to fail.
func (c *imageCache) begin(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e := c.entries[key]; e != nil {
		if e.loading || e.failed || e.bmp != nil {
			return false
		}
	}
	e := c.entries[key]
	if e == nil {
		e = &imageEntry{}
		c.entries[key] = e
	}
	e.loading = true
	c.tick++
	e.used = c.tick
	return true
}

func (c *imageCache) hasFailed(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	e := c.entries[key]
	return e != nil && e.failed
}

func (c *imageCache) fail(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e := c.entries[key]; e != nil {
		e.loading = false
		e.failed = true
	}
}

// put makes the bitmap on the main thread and stores it, evicting the least
// recently used entries past the byte budget or count.
func (c *imageCache) put(key string, img image.Image) {
	bmp := ui.NewBitmap(img)
	w, h := bmp.Size()
	size := int64(w) * int64(h) * 4
	c.mu.Lock()
	defer c.mu.Unlock()
	e := c.entries[key]
	if e == nil {
		e = &imageEntry{}
		c.entries[key] = e
	}
	if e.bmp != nil {
		c.bytes -= e.bytes
	}
	e.bmp = bmp
	e.bytes = size
	e.loading = false
	e.failed = false
	c.bytes += size
	c.evictLocked()
}

func (c *imageCache) evictLocked() {
	for len(c.entries) > 0 && (c.bytes > c.budget || len(c.entries) > c.max) {
		var oldestKey string
		var oldest *imageEntry
		for k, e := range c.entries {
			if e.bmp == nil {
				continue
			}
			if oldest == nil || e.used < oldest.used {
				oldestKey, oldest = k, e
			}
		}
		if oldest == nil {
			return
		}
		c.bytes -= oldest.bytes
		delete(c.entries, oldestKey)
	}
}

func (c *imageCache) reset() {
	c.mu.Lock()
	c.entries = map[string]*imageEntry{}
	c.bytes = 0
	c.mu.Unlock()
}

// thumbBucket returns the decode height for a row height, at 2x for Retina.
func thumbBucket(rowHeight float32) int {
	h := int(rowHeight * 2)
	switch {
	case h <= 128:
		return 128
	case h <= 192:
		return 192
	case h <= 256:
		return 256
	case h <= 384:
		return 384
	case h <= 512:
		return 512
	default:
		return 768
	}
}

func thumbKey(it *core.Item, rowHeight float32) string {
	return fmt.Sprintf("%s@%d", it.ID, thumbBucket(rowHeight))
}

func (a *App) thumbnail(it *core.Item, rowHeight float32) *ui.Bitmap {
	bucket := thumbBucket(rowHeight)
	key := thumbKey(it, rowHeight)
	if bmp := a.thumbs.get(key); bmp != nil {
		return bmp
	}
	if !a.thumbs.begin(key) {
		return nil
	}
	copied := *it
	go func() {
		img, err := loadThumbImage(&copied, bucket)
		if err != nil {
			a.thumbs.fail(key)
			return
		}
		a.update(func() {
			a.thumbs.put(key, img)
			a.host.invalidateAll()
		})
	}()
	return nil
}

func (a *App) previewImage(it *core.Item) *ui.Bitmap {
	key := it.ID
	if bmp := a.previews.get(key); bmp != nil {
		return bmp
	}
	if !a.previews.begin(key) {
		return nil
	}
	copied := *it
	go func() {
		img, err := loadPreviewImage(&copied)
		if err != nil {
			a.previews.fail(key)
			return
		}
		a.update(func() {
			a.previews.put(key, img)
			a.host.invalidateAll()
		})
	}()
	return nil
}

func thumbnailPath(it *core.Item) string {
	if it.ItemPath != "" {
		p := filepath.Join(it.ItemPath, "thumbnail.jpg")
		if st, err := os.Stat(p); err == nil && st.Size() > 0 {
			return p
		}
	}
	return ""
}

func loadThumbImage(it *core.Item, target int) (image.Image, error) {
	var candidates []string
	if p := thumbnailPath(it); p != "" {
		candidates = append(candidates, p)
	}
	if it.FilePath != "" && fileCategory(it.Extension, it.MimeType) == "image" {
		if st, err := os.Stat(it.FilePath); err == nil && st.Size() > 0 && st.Size() < 24<<20 {
			candidates = append(candidates, it.FilePath)
		}
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("no thumbnail for %s", it.Name)
	}
	var lastErr error
	for _, p := range candidates {
		img, err := decodeFile(p)
		if err != nil {
			lastErr = err
			continue
		}
		return scaleDown(img, 0, target), nil
	}
	return nil, lastErr
}

func loadPreviewImage(it *core.Item) (image.Image, error) {
	var p string
	switch fileCategory(it.Extension, it.MimeType) {
	case "image":
		p = it.FilePath
	default:
		if tp := thumbnailPath(it); tp != "" {
			p = tp
		}
	}
	if p == "" {
		if tp := thumbnailPath(it); tp != "" {
			p = tp
		}
	}
	if p == "" {
		return nil, fmt.Errorf("no preview for %s", it.Name)
	}
	img, err := decodeFile(p)
	if err != nil {
		return nil, err
	}
	return scaleDown(img, 3072, 3072), nil
}

func decodeFile(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		return nil, err
	}
	return img, nil
}

// scaleDown shrinks an image so neither side exceeds max, and its height does
// not exceed maxHeight. Images already smaller are returned unchanged.
func scaleDown(src image.Image, max, maxHeight int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return src
	}
	scale := 1.0
	if max > 0 {
		if m := max * 100 / maxInt(w, h); m < 100 {
			scale = float64(m) / 100
		}
	}
	if maxHeight > 0 && h*int(scale) > maxHeight {
		scale = float64(maxHeight) / float64(h)
	}
	if scale >= 1 {
		return src
	}
	nw, nh := maxInt(1, int(float64(w)*scale)), maxInt(1, int(float64(h)*scale))
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	xdraw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)
	return dst
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
