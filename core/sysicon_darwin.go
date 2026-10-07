//go:build darwin && !ios

package core

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework AppKit -framework UniformTypeIdentifiers

#import <Cocoa/Cocoa.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static void* getNativeIconPNG(const char* cExt, const char* cPath, int* outLength) {
    @autoreleasepool {
        NSImage *icon = nil;
        if (cPath != NULL && strlen(cPath) > 0) {
            NSString *filePath = [NSString stringWithUTF8String:cPath];
            if ([[NSFileManager defaultManager] fileExistsAtPath:filePath]) {
                icon = [[NSWorkspace sharedWorkspace] iconForFile:filePath];
            }
        }
        if (!icon && cExt != NULL && strlen(cExt) > 0) {
            NSString *ext = [NSString stringWithUTF8String:cExt];
            if (@available(macOS 11.0, *)) {
                UTType *type = [UTType typeWithFilenameExtension:ext];
                if (type) {
                    icon = [[NSWorkspace sharedWorkspace] iconForContentType:type];
                }
            }
            if (!icon) {
                #pragma clang diagnostic push
                #pragma clang diagnostic ignored "-Wdeprecated-declarations"
                icon = [[NSWorkspace sharedWorkspace] iconForFileType:ext];
                #pragma clang diagnostic pop
            }
        }

        if (!icon) {
            *outLength = 0;
            return NULL;
        }

        NSRect rect = NSMakeRect(0, 0, 128, 128);
        CGImageRef cgRef = [icon CGImageForProposedRect:&rect context:nil hints:nil];
        if (!cgRef) {
            *outLength = 0;
            return NULL;
        }

        NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:cgRef];
        NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        if (!pngData) {
            *outLength = 0;
            return NULL;
        }

        *outLength = (int)[pngData length];
        void *buffer = malloc((size_t)[pngData length]);
        memcpy(buffer, [pngData bytes], (size_t)[pngData length]);
        return buffer;
    }
}
*/
import "C"
import (
	"strings"
	"sync"
	"unsafe"
)

var (
	iconCache   = make(map[string][]byte)
	iconCacheMu sync.RWMutex
)

// GetSystemFileIconPNG returns PNG data of the native OS file icon for the given extension or file path.
func GetSystemFileIconPNG(ext string, filePath string) []byte {
	cacheKey := strings.ToLower(ext)
	if filePath == "" && cacheKey != "" {
		iconCacheMu.RLock()
		cached, ok := iconCache[cacheKey]
		iconCacheMu.RUnlock()
		if ok {
			return cached
		}
	}

	cExt := C.CString(ext)
	defer C.free(unsafe.Pointer(cExt))

	var cPath *C.char
	if filePath != "" {
		cPath = C.CString(filePath)
		defer C.free(unsafe.Pointer(cPath))
	}

	var length C.int
	ptr := C.getNativeIconPNG(cExt, cPath, &length)
	if ptr == nil || length <= 0 {
		return nil
	}
	defer C.free(ptr)

	pngBytes := C.GoBytes(ptr, length)

	if filePath == "" && cacheKey != "" {
		iconCacheMu.Lock()
		iconCache[cacheKey] = pngBytes
		iconCacheMu.Unlock()
	}

	return pngBytes
}
