package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestScrollHandlerReceivesWheel(t *testing.T) {
	got := false
	tester := ui.NewTester(func(c *ui.Context) {
		ui.Scroll(c).Grow(1).HandleInput(func(ev ui.InputEvent) bool {
			if ev.Kind == ui.InputScroll {
				got = true
			}
			return false
		}).Children(func() {
			ui.Box(c).Height(2000).FillWidth()
		})
	}, 400, 300)
	tester.Frame()
	tester.Scroll(200, 150, 0, -10)
	tester.Frame()
	if !got {
		t.Fatal("scroll handler not called")
	}
}
