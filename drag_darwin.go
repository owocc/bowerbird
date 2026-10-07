//go:build darwin && !ios

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework AppKit

#import <Cocoa/Cocoa.h>

@interface NativeFileDragSource : NSObject <NSDraggingSource>
@end

@implementation NativeFileDragSource
- (NSDragOperation)draggingSession:(NSDraggingSession *)session sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
    return NSDragOperationCopy | NSDragOperationGeneric;
}
@end

static bool doNativeFileDrag(void* windowPtr, const char* cPath) {
    if (!windowPtr || !cPath) return false;
    @autoreleasepool {
        NSWindow *window = (__bridge NSWindow*)windowPtr;
        NSView *view = [window contentView];
        NSString *filePath = [NSString stringWithUTF8String:cPath];

        NSEvent *event = [NSApp currentEvent];
        if (!event) {
            NSLog(@"[Bowerbird] doNativeFileDrag: no current event");
            return false;
        }

        NSURL *fileURL = [NSURL fileURLWithPath:filePath];
        NSDraggingItem *dragItem = [[NSDraggingItem alloc] initWithPasteboardWriter:fileURL];

        NSImage *icon = [[NSWorkspace sharedWorkspace] iconForFile:filePath];
        NSSize iconSize = NSMakeSize(48, 48);
        if (icon) {
            [icon setSize:iconSize];
        }

        NSPoint mouseLoc = [NSEvent mouseLocation];
        NSRect windowFrame = [window frame];
        NSPoint pointInWindow = NSMakePoint(mouseLoc.x - windowFrame.origin.x, mouseLoc.y - windowFrame.origin.y);
        NSRect dragRect = NSMakeRect(pointInWindow.x - 24, pointInWindow.y - 24, 48, 48);

        [dragItem setDraggingFrame:dragRect contents:icon];

        static NativeFileDragSource *dragSource = nil;
        if (!dragSource) {
            dragSource = [[NativeFileDragSource alloc] init];
        }

        NSDraggingSession *session = [view beginDraggingSessionWithItems:@[dragItem] event:event source:dragSource];
        return session != nil;
    }
}
*/
import "C"
import (
	"errors"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func (s *LibraryService) StartDrag(id string) error {
	item, err := s.GetItem(id)
	if err != nil || item == nil {
		return errors.New("item not found")
	}

	var window application.Window
	if s.window != nil {
		window = s.window
	} else if s.app != nil {
		window = s.app.Window.Current()
	}

	if window == nil {
		return errors.New("no window available")
	}

	windowPtr := window.NativeWindow()
	if windowPtr == nil {
		return errors.New("native window is nil")
	}

	filePath := item.FilePath

	var success bool
	application.InvokeSync(func() {
		cPath := C.CString(filePath)
		defer C.free(unsafe.Pointer(cPath))
		success = bool(C.doNativeFileDrag(windowPtr, cPath))
	})

	if !success {
		return errors.New("failed to start native drag session")
	}
	return nil
}
