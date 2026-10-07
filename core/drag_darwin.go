//go:build darwin && !ios

package core

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework AppKit -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

@interface NativeFileDragSource : NSObject <NSDraggingSource>
@end

@implementation NativeFileDragSource
- (NSDragOperation)draggingSession:(NSDraggingSession *)session sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
    return NSDragOperationCopy | NSDragOperationGeneric;
}
@end


static void parseAndAddPath(NSString *raw, NSMutableArray<NSURL *> *fileURLs, NSFileManager *fm) {
    if (!raw || [raw length] == 0) return;
    NSString *trimmed = [raw stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if ([trimmed length] == 0) return;

    // Check for JSON array e.g. ["/path1", "/path2"]
    if ([trimmed hasPrefix:@"["] && [trimmed hasSuffix:@"]"]) {
        NSData *jsonData = [trimmed dataUsingEncoding:NSUTF8StringEncoding];
        if (jsonData) {
            id parsed = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:nil];
            if ([parsed isKindOfClass:[NSArray class]]) {
                for (id entry in (NSArray *)parsed) {
                    if ([entry isKindOfClass:[NSString class]]) {
                        parseAndAddPath((NSString *)entry, fileURLs, fm);
                    }
                }
                return;
            }
        }
    }

    // Check for file:// URL
    if ([trimmed hasPrefix:@"file://"]) {
        NSURL *url = [NSURL URLWithString:trimmed];
        if (!url) {
            url = [NSURL URLWithString:[trimmed stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]]];
        }
        if (url && [url isFileURL]) {
            NSString *p = [url path];
            BOOL isDir = NO;
            if (p && [fm fileExistsAtPath:p isDirectory:&isDir]) {
                NSURL *validURL = [NSURL fileURLWithPath:p isDirectory:isDir];
                if (validURL && ![fileURLs containsObject:validURL]) {
                    [fileURLs addObject:validURL];
                }
                return;
            }
        }
    }

    // Check for direct POSIX file path
    if ([trimmed hasPrefix:@"/"]) {
        BOOL isDir = NO;
        if ([fm fileExistsAtPath:trimmed isDirectory:&isDir]) {
            NSURL *validURL = [NSURL fileURLWithPath:trimmed isDirectory:isDir];
            if (validURL && ![fileURLs containsObject:validURL]) {
                [fileURLs addObject:validURL];
            }
            return;
        }
    }
}

NSArray<NSURL *> *extractValidFileURLsFromPasteboard(NSPasteboard *pb) {
    if (!pb) return nil;
    NSMutableArray<NSURL *> *fileURLs = [NSMutableArray array];
    NSFileManager *fm = [NSFileManager defaultManager];

    // 1. Check if pasteboard already has native file URLs
    NSArray *existingUrls = [pb readObjectsForClasses:@[[NSURL class]]
                                              options:@{NSPasteboardURLReadingFileURLsOnlyKey: @YES}];
    if ([existingUrls count] > 0) {
        return existingUrls;
    }

    // 2. Parse paths or file URLs from NSPasteboardTypeString and NSPasteboardTypeURL
    for (NSPasteboardType type in @[NSPasteboardTypeString, NSPasteboardTypeURL]) {
        NSString *content = [pb stringForType:type];
        if (!content || [content length] == 0) continue;

        NSArray *lines = [content componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
        for (NSString *line in lines) {
            parseAndAddPath(line, fileURLs, fm);
        }

        if ([fileURLs count] > 0) {
            break;
        }
    }

    return fileURLs;
}

// augmentPasteboardWithFiles extracts validated physical file paths from the drag pasteboard,
// purges the raw plain text representation (to prevent macOS Finder from generating a .textClipping
// file and Figma from creating a text layer), and writes native file objects.
//
// Native pasteboard types populated:
// - public.file-url (NSPasteboardTypeFileURL)
// - NSFilenamesPboardType (NSArray of absolute filesystem paths)
// - CorePasteboardFlavorType 0x6675726C ('furl')
// - Apple URL pasteboard type
static void augmentPasteboardWithFiles(NSPasteboard *pb) {
    if (!pb) return;
    @autoreleasepool {
        NSArray<NSURL *> *fileURLs = extractValidFileURLsFromPasteboard(pb);
        if ([fileURLs count] > 0) {
            // Preserve intra-app Bowerbird flags (e.g. dragging onto sidebar folder tree)
            NSString *internalDrag = [pb stringForType:@"application/x-bowerbird-internal-drag"];
            NSString *itemId = [pb stringForType:@"application/x-bowerbird-item-id"];
            NSString *itemIds = [pb stringForType:@"application/x-bowerbird-item-ids"];

            // CRITICAL: Clear plain text (public.utf8-plain-text).
            // Without clearing, Finder prioritizes text and creates a .textClipping file,
            // while Figma reads plain text and creates an empty text box instead of importing images.
            [pb clearContents];

            // Write native file URLs (creates public.file-url and standard URL types)
            [pb writeObjects:fileURLs];

            // Explicitly ensure legacy NSFilenamesPboardType property list is populated
            // for Chromium / Electron / legacy AppKit targets
            NSMutableArray<NSString *> *paths = [NSMutableArray arrayWithCapacity:[fileURLs count]];
            for (NSURL *u in fileURLs) {
                [paths addObject:[u path]];
            }
            #pragma clang diagnostic push
            #pragma clang diagnostic ignored "-Wdeprecated-declarations"
            [pb setPropertyList:paths forType:NSFilenamesPboardType];
            #pragma clang diagnostic pop

            // Restore intra-app flags so internal folder assignment continues to work
            if (internalDrag) {
                [pb setString:internalDrag forType:@"application/x-bowerbird-internal-drag"];
            }
            if (itemId) {
                [pb setString:itemId forType:@"application/x-bowerbird-item-id"];
            }
            if (itemIds) {
                [pb setString:itemIds forType:@"application/x-bowerbird-item-ids"];
            }
        }
    }
}

// 1. Hook WKWebView draggingSession:willBeginAtPoint:
static void (*orig_wkWillBegin)(id, SEL, NSDraggingSession*, NSPoint) = NULL;
static void bowerbird_wkWillBegin(id self, SEL _cmd, NSDraggingSession *session, NSPoint pt) {
    if (session) {
        augmentPasteboardWithFiles([session draggingPasteboard]);
    }
    if (orig_wkWillBegin) {
        orig_wkWillBegin(self, _cmd, session, pt);
    }
}

// Hook WKWebView draggingSession:sourceOperationMaskForDraggingContext:
static NSDragOperation (*orig_wkSourceOpMask)(id, SEL, NSDraggingSession*, NSDraggingContext) = NULL;
static NSDragOperation bowerbird_wkSourceOpMask(id self, SEL _cmd, NSDraggingSession *session, NSDraggingContext context) {
    NSDragOperation mask = NSDragOperationCopy | NSDragOperationGeneric;
    if (orig_wkSourceOpMask) {
        mask |= orig_wkSourceOpMask(self, _cmd, session, context);
    }
    return mask;
}

// 2. Hook NSView beginDraggingSessionWithItems:event:source:
static NSDraggingSession* (*orig_beginDraggingSession)(id, SEL, NSArray*, NSEvent*, id<NSDraggingSource>) = NULL;
static NSDraggingSession* bowerbird_beginDraggingSession(id self, SEL _cmd, NSArray* items, NSEvent* event, id<NSDraggingSource> source) {
    NSDraggingSession *session = nil;
    if (orig_beginDraggingSession) {
        session = orig_beginDraggingSession(self, _cmd, items, event, source);
    }
    if (session) {
        augmentPasteboardWithFiles([session draggingPasteboard]);
    }
    return session;
}

// 3. Hook NSView dragImage:at:offset:event:pasteboard:source:slideBack:
static void (*orig_viewDragImage)(id, SEL, NSImage*, NSPoint, NSSize, NSEvent*, NSPasteboard*, id, BOOL) = NULL;
static void bowerbird_viewDragImage(id self, SEL _cmd, NSImage* img, NSPoint pt, NSSize sz, NSEvent* ev, NSPasteboard* pb, id src, BOOL slide) {
    augmentPasteboardWithFiles(pb);
    if (orig_viewDragImage) {
        orig_viewDragImage(self, _cmd, img, pt, sz, ev, pb, src, slide);
    }
}

// 4. Hook NSView _asyncDragImage:at:offset:event:pasteboard:source:slideBack:
static void (*orig_viewAsyncDragImage)(id, SEL, NSImage*, NSPoint, NSSize, NSEvent*, NSPasteboard*, id, BOOL) = NULL;
static void bowerbird_viewAsyncDragImage(id self, SEL _cmd, NSImage* img, NSPoint pt, NSSize sz, NSEvent* ev, NSPasteboard* pb, id src, BOOL slide) {
    augmentPasteboardWithFiles(pb);
    if (orig_viewAsyncDragImage) {
        orig_viewAsyncDragImage(self, _cmd, img, pt, sz, ev, pb, src, slide);
    }
}

// 5. Hook NSWindow dragImage:at:offset:event:pasteboard:source:slideBack:
static void (*orig_winDragImage)(id, SEL, NSImage*, NSPoint, NSSize, NSEvent*, NSPasteboard*, id, BOOL) = NULL;
static void bowerbird_winDragImage(id self, SEL _cmd, NSImage* img, NSPoint pt, NSSize sz, NSEvent* ev, NSPasteboard* pb, id src, BOOL slide) {
    augmentPasteboardWithFiles(pb);
    if (orig_winDragImage) {
        orig_winDragImage(self, _cmd, img, pt, sz, ev, pb, src, slide);
    }
}

// 6. Hook NSWindow _asyncDragImage:at:offset:event:pasteboard:source:slideBack:
static void (*orig_winAsyncDragImage)(id, SEL, NSImage*, NSPoint, NSSize, NSEvent*, NSPasteboard*, id, BOOL) = NULL;
static void bowerbird_winAsyncDragImage(id self, SEL _cmd, NSImage* img, NSPoint pt, NSSize sz, NSEvent* ev, NSPasteboard* pb, id src, BOOL slide) {
    augmentPasteboardWithFiles(pb);
    if (orig_winAsyncDragImage) {
        orig_winAsyncDragImage(self, _cmd, img, pt, sz, ev, pb, src, slide);
    }
}

static void installNativeDragHook(void) {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        // Hook WKWebView drag source methods
        Class wkClass = NSClassFromString(@"WKWebView");
        if (wkClass) {
            Method mWkBegin = class_getInstanceMethod(wkClass, @selector(draggingSession:willBeginAtPoint:));
            if (mWkBegin) {
                orig_wkWillBegin = (void*)method_getImplementation(mWkBegin);
                method_setImplementation(mWkBegin, (IMP)bowerbird_wkWillBegin);
            }
            Method mWkMask = class_getInstanceMethod(wkClass, @selector(draggingSession:sourceOperationMaskForDraggingContext:));
            if (mWkMask) {
                orig_wkSourceOpMask = (void*)method_getImplementation(mWkMask);
                method_setImplementation(mWkMask, (IMP)bowerbird_wkSourceOpMask);
            }
        }

        // Hook NSView drag methods
        Method mBegin = class_getInstanceMethod([NSView class], @selector(beginDraggingSessionWithItems:event:source:));
        if (mBegin) {
            orig_beginDraggingSession = (void*)method_getImplementation(mBegin);
            method_setImplementation(mBegin, (IMP)bowerbird_beginDraggingSession);
        }
        Method mDragImg = class_getInstanceMethod([NSView class], @selector(dragImage:at:offset:event:pasteboard:source:slideBack:));
        if (mDragImg) {
            orig_viewDragImage = (void*)method_getImplementation(mDragImg);
            method_setImplementation(mDragImg, (IMP)bowerbird_viewDragImage);
        }
        Method mAsyncDragImg = class_getInstanceMethod([NSView class], @selector(_asyncDragImage:at:offset:event:pasteboard:source:slideBack:));
        if (mAsyncDragImg) {
            orig_viewAsyncDragImage = (void*)method_getImplementation(mAsyncDragImg);
            method_setImplementation(mAsyncDragImg, (IMP)bowerbird_viewAsyncDragImage);
        }

        // Hook NSWindow drag methods
        Method mWinDragImg = class_getInstanceMethod([NSWindow class], @selector(dragImage:at:offset:event:pasteboard:source:slideBack:));
        if (mWinDragImg) {
            orig_winDragImage = (void*)method_getImplementation(mWinDragImg);
            method_setImplementation(mWinDragImg, (IMP)bowerbird_winDragImage);
        }
        Method mWinAsync = class_getInstanceMethod([NSWindow class], @selector(_asyncDragImage:at:offset:event:pasteboard:source:slideBack:));
        if (mWinAsync) {
            orig_winAsyncDragImage = (void*)method_getImplementation(mWinAsync);
            method_setImplementation(mWinAsync, (IMP)bowerbird_winAsyncDragImage);
        }
    });
}

__attribute__((constructor))
static void onLibraryLoaded(void) {
    installNativeDragHook();
}

static bool doNativeFileDrag(void* windowPtr, const char* cPath) {
    if (!windowPtr || !cPath) return false;
    @autoreleasepool {
        NSWindow *window = (__bridge NSWindow*)windowPtr;
        NSView *view = [window contentView];
        NSString *filePath = [NSString stringWithUTF8String:cPath];
        NSFileManager *fm = [NSFileManager defaultManager];
        BOOL isDir = NO;
        if (![fm fileExistsAtPath:filePath isDirectory:&isDir]) {
            return false;
        }

        NSURL *fileURL = [NSURL fileURLWithPath:filePath isDirectory:isDir];
        NSDraggingItem *dragItem = [[NSDraggingItem alloc] initWithPasteboardWriter:fileURL];

        NSImage *icon = [[NSWorkspace sharedWorkspace] iconForFile:filePath];
        NSSize iconSize = NSMakeSize(48, 48);
        if (icon) {
            [icon setSize:iconSize];
        }

        NSPoint mouseLoc = [window mouseLocationOutsideOfEventStream];
        NSRect dragRect = NSMakeRect(mouseLoc.x - 24, mouseLoc.y - 24, 48, 48);
        [dragItem setDraggingFrame:dragRect contents:icon];

        NSEvent *event = [NSApp currentEvent];
        NSTimeInterval timestamp = event ? [event timestamp] : 0.0;
        NSEvent *dragEvent = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDragged
                                                location:mouseLoc
                                           modifierFlags:0
                                               timestamp:timestamp
                                            windowNumber:[window windowNumber]
                                                 context:nil
                                             eventNumber:0
                                              clickCount:1
                                                pressure:1.0];

        static NativeFileDragSource *dragSource = nil;
        if (!dragSource) {
            dragSource = [[NativeFileDragSource alloc] init];
        }

        NSDraggingSession *session = [view beginDraggingSessionWithItems:@[dragItem] event:dragEvent source:dragSource];
        if (session) {
            augmentPasteboardWithFiles([session draggingPasteboard]);
            return true;
        }
        return false;
    }
}

static int testPasteboardAugmentation(const char **paths, int count, char ***outFilenames, int *outCount) {
    @autoreleasepool {
        NSPasteboard *pb = [NSPasteboard pasteboardWithUniqueName];
        [pb clearContents];

        NSMutableString *joined = [NSMutableString string];
        for (int i = 0; i < count; i++) {
            if (i > 0) [joined appendString:@"\n"];
            [joined appendString:[NSString stringWithUTF8String:paths[i]]];
        }
        [pb setString:joined forType:NSPasteboardTypeString];

        augmentPasteboardWithFiles(pb);
        #pragma clang diagnostic push
        #pragma clang diagnostic ignored "-Wdeprecated-declarations"
        NSArray *filenames = [pb propertyListForType:NSFilenamesPboardType];
        #pragma clang diagnostic pop
        if (!filenames) {
            *outCount = 0;
            return -2;
        }

        int n = (int)[filenames count];
        *outCount = n;
        *outFilenames = (char **)malloc(sizeof(char *) * n);
        for (int i = 0; i < n; i++) {
            NSString *fn = filenames[i];
            (*outFilenames)[i] = strdup([fn UTF8String]);
        }
        return 0;
    }
}
*/
import "C"
import (
	"errors"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func init() {
	C.installNativeDragHook()
}

func (m *LibraryManager) StartDrag(id string) error {
	item, err := m.GetItem(id)
	if err != nil || item == nil {
		return errors.New("item not found")
	}

	window := m.getWindow()
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

// AugmentPasteboardForTesting exercises the pasteboard file extraction and augmentation logic.
func AugmentPasteboardForTesting(paths []string) ([]string, error) {
	if len(paths) == 0 {
		return nil, nil
	}
	cPaths := make([]*C.char, len(paths))
	for i, p := range paths {
		cPaths[i] = C.CString(p)
		defer C.free(unsafe.Pointer(cPaths[i]))
	}

	var outFilenames **C.char
	var outCount C.int
	ret := C.testPasteboardAugmentation((**C.char)(&cPaths[0]), C.int(len(paths)), &outFilenames, &outCount)
	if ret != 0 {
		return nil, errors.New("pasteboard augmentation failed")
	}
	defer C.free(unsafe.Pointer(outFilenames))

	count := int(outCount)
	result := make([]string, count)
	cSlice := (*[1 << 20]*C.char)(unsafe.Pointer(outFilenames))[:count:count]
	for i := 0; i < count; i++ {
		result[i] = C.GoString(cSlice[i])
		C.free(unsafe.Pointer(cSlice[i]))
	}
	return result, nil
}
