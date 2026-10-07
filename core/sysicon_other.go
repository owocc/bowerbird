//go:build !darwin || ios

package core

// GetSystemFileIconPNG fallback for non-macOS platforms.
func GetSystemFileIconPNG(ext string, filePath string) []byte {
	return nil
}
