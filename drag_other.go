//go:build !darwin || ios

package main

func (s *LibraryService) StartDrag(id string) error {
	return nil
}
