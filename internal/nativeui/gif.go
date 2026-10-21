package nativeui

import (
	"image"
	"image/draw"
	"image/gif"
	"math"
	"os"
	"strings"
	"sync"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
	xdraw "golang.org/x/image/draw"
)

// GIF animation is deliberately small: frames are decoded off the main
// thread, downsampled to the size they are shown at, and only a handful of
// grid cells animate at once, so scrolling a wall of GIFs stays smooth.
const (
	gifGridActive   = 6
	gifGridMinDelay = 80 * time.Millisecond
	gifPreviewDelay = 33 * time.Millisecond
	gifCacheBudget  = 96 << 20
	gifMaxFrames    = 400
	gifMaxPixels    = 32 << 20
)

type gifCache struct {
	mu      sync.Mutex
	entries map[string]*gifAnim
	bytes   int64
	tick    uint64
	looping bool
}

type gifAnim struct {
	frames []image.Image
	delays []time.Duration
	bytes  int64

	bmp     *ui.Bitmap
	idx     int
	next    time.Time
	active  time.Time
	preview bool
	used    uint64
	loading bool
	failed  bool
}

func newGIFCache() *gifCache {
	return &gifCache{entries: map[string]*gifAnim{}}
}

func gifKey(it *core.Item, bucket int) string { return it.ID + "@" + itoa(bucket) }

func (c *gifCache) hasFailed(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	e := c.entries[key]
	return e != nil && e.failed
}

func (c *gifCache) bytesAndCount() (int64, int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.bytes, len(c.entries)
}

func (c *gifCache) reset() {
	c.mu.Lock()
	c.entries = map[string]*gifAnim{}
	c.bytes = 0
	c.mu.Unlock()
}

// isAnimatedGIF reports whether the item is a GIF from the image category.
// The cache decides whether it really has more than one frame.
func isAnimatedGIF(it *core.Item) bool {
	return strings.EqualFold(strings.TrimPrefix(it.Extension, "."), "gif") &&
		fileCategory(it.Extension, it.MimeType) == "image"
}

// gifFrame returns the current frame's bitmap for a GIF, starting its decode
// and the animation loop when needed. While the gallery scrolls, or when too
// many GIFs already animate, it returns the first frame without advancing.
func (a *App) gifFrame(it *core.Item, bucket int, preview bool) *ui.Bitmap {
	key := gifKey(it, bucket)
	c := a.gifs
	c.mu.Lock()
	e := c.entries[key]
	if e == nil {
		e = &gifAnim{}
		c.entries[key] = e
	}
	c.tick++
	e.used = c.tick
	now := time.Now()
	if e.loading || e.failed {
		bmp := e.bmp
		c.mu.Unlock()
		return bmp
	}
	if len(e.frames) == 0 {
		e.loading = true
		c.mu.Unlock()
		copied := *it
		go a.loadGIF(key, &copied, bucket)
		return nil
	}
	if e.bmp == nil {
		e.bmp = ui.NewBitmap(e.frames[0])
	}
	active := preview || (!a.isScrolling() && c.activeCountLocked(now) < gifGridActive)
	if active {
		e.active = now.Add(700 * time.Millisecond)
		e.preview = preview
	}
	bmp := e.bmp
	c.mu.Unlock()
	if active {
		a.ensureGIFLoop()
	}
	return bmp
}

func (c *gifCache) activeCountLocked(now time.Time) int {
	n := 0
	for _, e := range c.entries {
		if e.active.After(now) {
			n++
		}
	}
	return n
}

func (a *App) isScrolling() bool {
	return !a.lastScrollAt.IsZero() && time.Since(a.lastScrollAt) < 250*time.Millisecond
}

// gifTarget is the longest side frames of a bucket are decoded at.
func gifTarget(bucket int) int {
	if bucket >= 1024 {
		return bucket
	}
	return bucket
}

func (a *App) loadGIF(key string, it *core.Item, bucket int) {
	path := ""
	if it.FilePath != "" && isAnimatedGIF(it) {
		path = it.FilePath
	}
	if path == "" {
		if p := thumbnailPath(it); p != "" {
			path = p
		}
	}
	if path == "" {
		a.gifs.mu.Lock()
		if e := a.gifs.entries[key]; e != nil {
			e.loading = false
			e.failed = true
		}
		a.gifs.mu.Unlock()
		return
	}
	frames, delays, bytes, err := decodeGIF(path, gifTarget(bucket))
	if err != nil || len(frames) == 0 {
		a.gifs.mu.Lock()
		if e := a.gifs.entries[key]; e != nil {
			e.loading = false
			e.failed = true
		}
		a.gifs.mu.Unlock()
		return
	}
	a.update(func() {
		c := a.gifs
		c.mu.Lock()
		e := c.entries[key]
		if e == nil {
			e = &gifAnim{}
			c.entries[key] = e
		}
		e.frames, e.delays, e.bytes = frames, delays, bytes
		e.loading = false
		e.failed = false
		c.bytes += bytes
		c.evictLocked(time.Now())
		c.mu.Unlock()
		a.logCacheMetrics(len(a.items))
		a.host.invalidateAll()
	})
}

func (c *gifCache) evictLocked(now time.Time) {
	for (c.bytes > gifCacheBudget || len(c.entries) > 24) && len(c.entries) > 0 {
		var oldKey string
		var old *gifAnim
		for k, e := range c.entries {
			if e.active.After(now) || e.loading {
				continue
			}
			if old == nil || e.used < old.used {
				oldKey, old = k, e
			}
		}
		if old == nil {
			return
		}
		c.bytes -= old.bytes
		delete(c.entries, oldKey)
	}
}

// ensureGIFLoop starts one timer that advances active GIFs. It stops itself
// when nothing has been active for a second, so an idle library costs
// nothing.
func (a *App) ensureGIFLoop() {
	c := a.gifs
	c.mu.Lock()
	if c.looping {
		c.mu.Unlock()
		return
	}
	c.looping = true
	c.mu.Unlock()
	go func() {
		ticker := time.NewTicker(40 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			stop := true
			a.update(func() {
				c := a.gifs
				now := time.Now()
				c.mu.Lock()
				changed := false
				idle := true
				for _, e := range c.entries {
					if e.active.After(now) {
						idle = false
						stop = false
					}
					if e.bmp == nil || len(e.frames) < 2 || e.next.After(now) {
						continue
					}
					e.idx = (e.idx + 1) % len(e.frames)
					e.bmp.Update(e.frames[e.idx])
					delay := e.delays[e.idx]
					minDelay := gifGridMinDelay
					if e.preview {
						minDelay = gifPreviewDelay
					}
					if delay < minDelay {
						delay = minDelay
					}
					e.next = now.Add(delay)
					changed = true
				}
				if idle {
					stop = true
				}
				c.mu.Unlock()
				if changed {
					a.host.invalidateAll()
				}
			})
			if stop {
				c.mu.Lock()
				c.looping = false
				c.mu.Unlock()
				return
			}
		}
	}()
}

// decodeGIF composites a GIF's frames and scales each to maxSide. Frames
// beyond the caps fall back to a still first frame.
func decodeGIF(path string, maxSide int) ([]image.Image, []time.Duration, int64, error) {
	fi, err := os.Stat(path)
	if err != nil {
		return nil, nil, 0, err
	}
	if fi.Size() > 48<<20 {
		img, err := decodeFile(path)
		if err != nil {
			return nil, nil, 0, err
		}
		one := scaleDown(img, maxSide, maxSide)
		return []image.Image{one}, []time.Duration{time.Second}, bitmapBytes(one), nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, 0, err
	}
	defer f.Close()
	g, err := gif.DecodeAll(f)
	if err != nil {
		img, derr := decodeFile(path)
		if derr != nil {
			return nil, nil, 0, err
		}
		one := scaleDown(img, maxSide, maxSide)
		return []image.Image{one}, []time.Duration{time.Second}, bitmapBytes(one), nil
	}
	w, h := g.Config.Width, g.Config.Height
	if w <= 0 || h <= 0 {
		return nil, nil, 0, os.ErrInvalid
	}
	if len(g.Image) < 2 || len(g.Image) > gifMaxFrames || w*h > gifMaxPixels {
		draw0 := image.NewRGBA(image.Rect(0, 0, w, h))
		if len(g.Image) > 0 {
			draw.Draw(draw0, g.Image[0].Bounds(), g.Image[0], image.Point{}, draw.Over)
		}
		one := scaleDown(draw0, maxSide, maxSide)
		return []image.Image{one}, []time.Duration{time.Second}, bitmapBytes(one), nil
	}
	// Keep the whole animation within the cache budget: shrink the decode
	// target when the frames would not fit, and fall back to a still for
	// extreme animations.
	if perFrame := int64(w) * int64(h) * 4; perFrame*int64(len(g.Image)) > gifCacheBudget {
		scale := math.Sqrt(float64(gifCacheBudget) / float64(perFrame*int64(len(g.Image))))
		target := int(float64(maxSide) * scale)
		if target < 64 {
			draw0 := image.NewRGBA(image.Rect(0, 0, w, h))
			draw.Draw(draw0, g.Image[0].Bounds(), g.Image[0], image.Point{}, draw.Over)
			one := scaleDown(draw0, 64, 64)
			return []image.Image{one}, []time.Duration{time.Second}, bitmapBytes(one), nil
		}
		maxSide = target
	}
	canvas := image.NewRGBA(image.Rect(0, 0, w, h))
	var restore *image.RGBA
	var frames []image.Image
	var delays []time.Duration
	var total int64
	prevRect := image.Rectangle{}
	for i, fr := range g.Image {
		if i > 0 {
			switch g.Disposal[i-1] {
			case gif.DisposalBackground:
				draw.Draw(canvas, prevRect.Intersect(canvas.Bounds()), image.Transparent, image.Point{}, draw.Src)
			case gif.DisposalPrevious:
				if restore != nil {
					copy(canvas.Pix, restore.Pix)
				}
			}
		}
		if g.Disposal[i] == gif.DisposalPrevious {
			restore = image.NewRGBA(canvas.Bounds())
			copy(restore.Pix, canvas.Pix)
		}
		draw.Draw(canvas, fr.Bounds(), fr, image.Point{}, draw.Over)
		prevRect = fr.Bounds()
		scaled := scaleDownCopy(canvas, maxSide, maxSide)
		frames = append(frames, scaled)
		total += bitmapBytes(scaled)
		d := g.Delay[i]
		if d <= 0 {
			d = 10
		}
		delays = append(delays, time.Duration(d)*10*time.Millisecond)
	}
	if len(frames) == 0 {
		return nil, nil, 0, os.ErrInvalid
	}
	return frames, delays, total, nil
}

func bitmapBytes(img image.Image) int64 {
	b := img.Bounds()
	return int64(b.Dx()) * int64(b.Dy()) * 4
}

// scaleDownCopy always returns a detached image, so a compositing canvas can
// keep changing without touching a stored frame.
func scaleDownCopy(src image.Image, max, maxHeight int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return src
	}
	scale := 1.0
	if max > 0 && maxInt(w, h) > max {
		scale = float64(max) / float64(maxInt(w, h))
	}
	if maxHeight > 0 && float64(h)*scale > float64(maxHeight) {
		scale = float64(maxHeight) / float64(h)
	}
	nw, nh := maxInt(1, int(float64(w)*scale)), maxInt(1, int(float64(h)*scale))
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	xdraw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)
	return dst
}
