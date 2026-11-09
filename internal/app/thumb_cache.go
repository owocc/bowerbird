package app

import (
	"os"
	"path/filepath"
	"sync"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// thumbCache decodes thumbnails off the main thread and keeps the resulting
// GPU-ready bitmaps in an LRU. Items are keyed by path plus target size, so a
// zoom change asks for a new texture instead of stretching a tiny one.
type thumbCache struct {
	mu      sync.Mutex
	entries map[string]*thumbEntry
	order   []string
	limit   int
	closed  bool
	notify  func()
}

type thumbEntry struct {
	bmp   *ui.Bitmap
	fails int
}

type thumbResult struct {
	key string
	bmp *ui.Bitmap
	err error
}

func newThumbCache() *thumbCache {
	return &thumbCache{entries: map[string]*thumbEntry{}, limit: 320}
}

func (c *thumbCache) setNotify(fn func()) {
	c.mu.Lock()
	c.notify = fn
	c.mu.Unlock()
}

// get returns a decoded bitmap, or nil while a worker is still decoding. The
// caller redraws when notify fires.
func (c *thumbCache) get(path string, targetPx int) *ui.Bitmap {
	if path == "" {
		return nil
	}
	c.mu.Lock()
	if e, ok := c.entries[path]; ok {
		c.touchLocked(path)
		c.mu.Unlock()
		return e.bmp
	}
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	// A placeholder entry marks an in-flight decode.
	c.entries[path] = &thumbEntry{}
	c.touchLocked(path)
	c.mu.Unlock()

	go func() {
		bmp, err := decodePath(path, targetPx)
		c.mu.Lock()
		if c.closed {
			c.mu.Unlock()
			return
		}
		if err != nil {
			delete(c.entries, path)
		} else {
			c.entries[path] = &thumbEntry{bmp: bmp}
		}
		notify := c.notify
		c.trimLocked()
		c.mu.Unlock()
		if notify != nil {
			notify()
		}
	}()
	return nil
}

// getSystemIcon retrieves or generates the native OS system file icon as a bitmap.
func (c *thumbCache) getSystemIcon(ext string, filePath string) *ui.Bitmap {
	key := "sysicon:" + ext
	if filePath != "" {
		key += ":" + filePath
	}
	c.mu.Lock()
	if e, ok := c.entries[key]; ok {
		c.touchLocked(key)
		c.mu.Unlock()
		return e.bmp
	}
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.entries[key] = &thumbEntry{}
	c.touchLocked(key)
	c.mu.Unlock()

	go func() {
		pngBytes := core.GetSystemFileIconPNG(ext, filePath)
		var bmp *ui.Bitmap
		var err error
		if len(pngBytes) > 0 {
			bmp, err = ui.DecodeBitmap(pngBytes)
		}
		c.mu.Lock()
		if c.closed {
			c.mu.Unlock()
			return
		}
		if err != nil || bmp == nil {
			delete(c.entries, key)
		} else {
			c.entries[key] = &thumbEntry{bmp: bmp}
		}
		notify := c.notify
		c.trimLocked()
		c.mu.Unlock()
		if notify != nil {
			notify()
		}
	}()
	return nil
}

func (c *thumbCache) touchLocked(key string) {
	for i, k := range c.order {
		if k == key {
			c.order = append(c.order[:i], c.order[i+1:]...)
			break
		}
	}
	c.order = append(c.order, key)
}

func (c *thumbCache) trimLocked() {
	if len(c.order) <= c.limit {
		return
	}
	drop := len(c.order) - c.limit
	keep := append([]string(nil), c.order[drop:]...)
	for _, key := range c.order[:drop] {
		if e := c.entries[key]; e != nil && e.bmp != nil {
			e.bmp.ReleasePixels()
		}
		delete(c.entries, key)
	}
	c.order = keep
}

// invalidate drops one decoded texture so a regenerated thumbnail.jpg is read
// again on the next paint.
func (c *thumbCache) invalidate(path string) {
	if path == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.entries[path]; ok {
		if e.bmp != nil {
			e.bmp.ReleasePixels()
		}
		delete(c.entries, path)
	}
	for i, key := range c.order {
		if key == path {
			c.order = append(c.order[:i], c.order[i+1:]...)
			break
		}
	}
}

// trim releases textures down to keep entries.
func (c *thumbCache) trim(keep int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if keep < 0 {
		keep = 0
	}
	old := c.limit
	c.limit = keep
	c.order = append([]string(nil), c.order...)
	// Drop the least recently used first.
	for len(c.order) > keep {
		key := c.order[0]
		c.order = c.order[1:]
		if e := c.entries[key]; e != nil && e.bmp != nil {
			e.bmp.ReleasePixels()
		}
		delete(c.entries, key)
	}
	c.limit = old
}

func (c *thumbCache) restore() {
	c.mu.Lock()
	c.closed = false
	c.mu.Unlock()
}

func (c *thumbCache) clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, e := range c.entries {
		if e.bmp != nil {
			e.bmp.ReleasePixels()
		}
	}
	c.entries = map[string]*thumbEntry{}
	c.order = nil
}

func decodePath(path string, targetPx int) (*ui.Bitmap, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	// DecodeBitmap uses the GPU texture path and supports the formats the
	// library writes (JPEG thumbnails; PNG/WebP originals).
	bmp, err := ui.DecodeBitmap(data)
	if err != nil {
		return nil, err
	}
	_ = targetPx
	return bmp, nil
}

// thumbPath is where the core pipeline stores a JPEG thumbnail.
func thumbPath(itemPath string) string {
	if itemPath == "" {
		return ""
	}
	return filepath.Join(itemPath, "thumbnail.jpg")
}
