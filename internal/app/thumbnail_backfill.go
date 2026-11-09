package app

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"os"
	"path/filepath"
	"strings"
	"time"

	"bowerbird/core"
	"bowerbird/internal/player"
)

const (
	thumbnailWorkers     = 2
	thumbnailMaxAttempts = 2
)

// thumbTask is one queued cover generation. force is set for the explicit
// "Generate thumbnails" menu action: it regenerates covers that already exist
// and resets the automatic failure cache.
type thumbTask struct {
	item  core.Item
	force bool
}

// thumbJobQueue mirrors the old thumbnail-backfill scheduler: dedupe by item
// id, limit concurrency, retry once, and remember permanent failures until the
// user explicitly triggers generation again.
type thumbJobQueue struct {
	queue    []thumbTask
	queued   map[string]bool
	inFlight map[string]bool
	attempts map[string]int
	failed   map[string]bool
	force    map[string]bool
	active   int
}

func newThumbJobQueue() *thumbJobQueue {
	return &thumbJobQueue{
		queued:   map[string]bool{},
		inFlight: map[string]bool{},
		attempts: map[string]int{},
		failed:   map[string]bool{},
		force:    map[string]bool{},
	}
}

// canGenerateThumbnail reports whether this item has a native or plugin
// provider. Video and PSD are handled by the compiled-in native plugins; other
// formats ask the sandboxed plugin host for a thumbnail hook.
func (a *App) canGenerateThumbnail(item core.Item) bool {
	if item.FilePath == "" {
		return false
	}
	ext := strings.ToLower(item.Extension)
	if (ext == "psd" || ext == "psb") && a.nativeFeature("official.psd-preview") {
		return true
	}
	if categoryOf(item) == "video" && a.nativeFeature("builtin.video") {
		return true
	}
	return a.pluginHost != nil && a.pluginHost.CanGenerateThumbnail(item.Extension, item.MimeType)
}

// backfillMissingThumbnails queues items loaded for the current page that have
// no cover yet. It is safe to call after every refresh; queued, in-flight,
// permanently failed and already-covered items are skipped.
func (a *App) backfillMissingThumbnails(items []core.Item) {
	if a.thumbJobs == nil {
		return
	}
	for _, item := range items {
		if item.HasThumbnail || item.InTrash {
			continue
		}
		a.enqueueThumbnail(item, false)
	}
	a.drainThumbnails()
}

// regenerateThumbnails is the manual path used by the gallery context menu. It
// forces a new cover even when one already exists (for example a bad video
// frame) and clears the old failure/attempt state.
func (a *App) regenerateThumbnails(ids []string) {
	if a.thumbJobs == nil || len(ids) == 0 {
		return
	}
	wanted := make(map[string]bool, len(ids))
	for _, id := range ids {
		wanted[id] = true
	}
	var queued int
	for _, item := range a.items {
		if !wanted[item.ID] || item.InTrash {
			continue
		}
		if !a.canGenerateThumbnail(item) {
			continue
		}
		a.enqueueThumbnail(item, true)
		queued++
	}
	a.drainThumbnails()
	if queued > 0 {
		a.showToast(a.t("contextMenu.generateThumbnails"))
	}
}

func (a *App) enqueueThumbnail(item core.Item, force bool) {
	j := a.thumbJobs
	if j == nil || item.ID == "" || !a.canGenerateThumbnail(item) {
		return
	}
	if force {
		delete(j.failed, item.ID)
		delete(j.attempts, item.ID)
		j.force[item.ID] = true
	} else if j.failed[item.ID] {
		return
	}
	if j.inFlight[item.ID] {
		return
	}
	if j.queued[item.ID] {
		if force {
			for i := range j.queue {
				if j.queue[i].item.ID == item.ID {
					j.queue[i].force = true
					break
				}
			}
		}
		return
	}
	j.queued[item.ID] = true
	j.queue = append(j.queue, thumbTask{item: item, force: force || j.force[item.ID]})
	delete(j.force, item.ID)
}

func (a *App) drainThumbnails() {
	j := a.thumbJobs
	if j == nil || a.svc == nil {
		return
	}
	for j.active < thumbnailWorkers && len(j.queue) > 0 {
		task := j.queue[0]
		j.queue = j.queue[1:]
		id := task.item.ID
		delete(j.queued, id)
		if j.inFlight[id] {
			continue
		}
		if !task.force && (task.item.HasThumbnail || j.failed[id]) {
			continue
		}
		j.active++
		j.inFlight[id] = true
		go func(task thumbTask) {
			updated, err := a.generateThumbnail(task.item, task.force)
			a.post(func() { a.finishThumbnail(task, updated, err) })
		}(task)
	}
}

func (a *App) finishThumbnail(task thumbTask, updated *core.Item, err error) {
	j := a.thumbJobs
	if j == nil {
		return
	}
	id := task.item.ID
	j.active--
	delete(j.inFlight, id)
	if err == nil && updated != nil {
		delete(j.attempts, id)
		delete(j.failed, id)
		a.applyThumbnailUpdate(updated)
	} else {
		tries := j.attempts[id] + 1
		j.attempts[id] = tries
		detail := ""
		if err != nil {
			detail = err.Error()
		}
		if tries < thumbnailMaxAttempts {
			j.queued[id] = true
			j.queue = append(j.queue, task)
			core.RecordLog("warn", "plugin",
				fmt.Sprintf("Cover thumbnail attempt %d/%d failed: %s", tries, thumbnailMaxAttempts, id),
				detail, 0)
		} else {
			j.failed[id] = true
			delete(j.attempts, id)
			core.RecordLog("error", "plugin",
				fmt.Sprintf("Cover thumbnail generation gave up: %s", id),
				detail, 0)
		}
	}
	a.drainThumbnails()
}

// applyThumbnailUpdate merges a generated cover into the current page without
// a full library refresh, so the gallery repaints immediately.
func (a *App) applyThumbnailUpdate(updated *core.Item) {
	if updated == nil {
		return
	}
	changed := false
	for i := range a.items {
		if a.items[i].ID == updated.ID {
			a.items[i] = *updated
			changed = true
			break
		}
	}
	if !changed {
		return
	}
	if a.activeItem != nil && a.activeItem.ID == updated.ID {
		copyItem := *updated
		a.activeItem = &copyItem
	}
	if updated.ItemPath != "" {
		a.thumbs.invalidate(filepath.Join(updated.ItemPath, "thumbnail.jpg"))
	}
	a.rebuildRows()
	if a.win != nil {
		a.win.Invalidate()
	}
	core.RecordLog("info", "plugin", fmt.Sprintf("Cover thumbnail generated: %s", updated.ID),
		fmt.Sprintf("ext=%s dims=%dx%d", updated.Extension, updated.Width, updated.Height), 0)
}

// generateThumbnail runs the native or plugin provider off the main thread.
func (a *App) generateThumbnail(item core.Item, force bool) (*core.Item, error) {
	start := time.Now()
	ext := strings.ToLower(item.Extension)

	// PSD/PSB: use the same native composite decoder as the preview.
	if (ext == "psd" || ext == "psb") && a.nativeFeature("official.psd-preview") {
		info, img, err := core.ReadPSD(item.FilePath)
		if err == nil && img != nil {
			updated, saveErr := a.svc.SaveItemThumbnailImage(item.ID, img, info.Width, info.Height)
			if saveErr == nil {
				a.logThumbnailSuccess(item, "psd", start)
				return updated, nil
			}
			err = saveErr
		}
		// Fall through to a plugin-provided generator when the native decoder
		// cannot handle this PSD (CMYK/16-bit/etc.).
		if err != nil && (a.pluginHost == nil || !a.pluginHost.CanGenerateThumbnail(item.Extension, item.MimeType)) {
			return nil, err
		}
	}

	// Video: prefer AVFoundation's embedded artwork/first frame on macOS,
	// then ffmpeg for every other container/platform.
	if categoryOf(item) == "video" && a.nativeFeature("builtin.video") {
		img, width, height := core.ExtractNativeVideoFrame(item.FilePath)
		var err error
		if img == nil {
			img, width, height, err = player.ExtractVideoFrame(item.FilePath, item.Width, item.Height)
		}
		if err == nil && img != nil {
			updated, saveErr := a.svc.SaveItemThumbnailImage(item.ID, img, width, height)
			if saveErr == nil {
				a.logThumbnailSuccess(item, "video", start)
				return updated, nil
			}
			err = saveErr
		}
		if err != nil && (a.pluginHost == nil || !a.pluginHost.CanGenerateThumbnail(item.Extension, item.MimeType)) {
			return nil, err
		}
	}

	// Plugin hook: thumbnail({ filePath, mimeType }) returns an image path.
	if a.pluginHost != nil && a.pluginHost.CanGenerateThumbnail(item.Extension, item.MimeType) {
		out, err := a.pluginHost.Thumbnail(item.FilePath, item.Extension, item.MimeType)
		if err != nil {
			return nil, err
		}
		imagePath, _ := out["imagePath"].(string)
		if imagePath == "" {
			return nil, errors.New("plugin returned no imagePath")
		}
		data, err := os.ReadFile(imagePath)
		if err != nil {
			return nil, err
		}
		img, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		width := intValue(out["width"])
		height := intValue(out["height"])
		updated, err := a.svc.SaveItemThumbnailImage(item.ID, img, width, height)
		if err == nil {
			a.logThumbnailSuccess(item, "plugin", start)
		}
		return updated, err
	}

	if force {
		return nil, errors.New("no thumbnail provider for this format")
	}
	return nil, errors.New("no thumbnail provider")
}

func (a *App) logThumbnailSuccess(item core.Item, provider string, start time.Time) {
	core.RecordLog("info", "plugin",
		fmt.Sprintf("Cover thumbnail generated: %s", item.ID),
		fmt.Sprintf("provider=%s ext=%s bytes=%d durationMs=%d", provider, item.Extension, item.Size, time.Since(start).Milliseconds()),
		time.Since(start).Milliseconds())
}

func intValue(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}
