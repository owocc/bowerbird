//go:build !darwin || ios

package core

import "image"

// ExtractNativeVideoFrame fallback for non-macOS platforms (where the frontend video plugin
// captures the first frame or embedded cover and persists it via SaveItemThumbnail).
func ExtractNativeVideoFrame(filePath string) (image.Image, int, int) {
	return nil, 0, 0
}
