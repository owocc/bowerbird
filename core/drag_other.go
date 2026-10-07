//go:build !darwin || ios

package core

func (m *LibraryManager) StartDrag(id string) error {
	return nil
}
