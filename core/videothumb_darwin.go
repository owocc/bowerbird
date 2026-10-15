//go:build darwin && !ios

package core

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Foundation -framework AVFoundation -framework CoreMedia -framework CoreGraphics -framework AppKit

#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreGraphics/CoreGraphics.h>
#import <AppKit/AppKit.h>

static void* extractVideoCoverOrFirstFramePNG(const char* cPath, int* outLength, int* outWidth, int* outHeight) {
    @autoreleasepool {
        *outLength = 0;
        *outWidth = 0;
        *outHeight = 0;
        if (cPath == NULL || strlen(cPath) == 0) {
            return NULL;
        }
        NSString *filePath = [NSString stringWithUTF8String:cPath];
        if (![[NSFileManager defaultManager] fileExistsAtPath:filePath]) {
            return NULL;
        }
        NSURL *url = [NSURL fileURLWithPath:filePath];
        AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:nil];
        if (!asset) {
            return NULL;
        }

        // 1. Determine natural video track dimensions (accounting for preferredTransform)
        #pragma clang diagnostic push
        #pragma clang diagnostic ignored "-Wdeprecated-declarations"
        NSArray<AVAssetTrack *> *videoTracks = [asset tracksWithMediaType:AVMediaTypeVideo];
        if (videoTracks.count > 0) {
            AVAssetTrack *track = videoTracks.firstObject;
            CGSize naturalSize = CGSizeApplyAffineTransform(track.naturalSize, track.preferredTransform);
            int w = (int)fabs(naturalSize.width);
            int h = (int)fabs(naturalSize.height);
            if (w > 0 && h > 0) {
                *outWidth = w;
                *outHeight = h;
            }
        }

        // 2. Priority 1: Check for embedded artwork / cover metadata in the video container
        NSArray<AVMetadataItem *> *artworks = [AVMetadataItem metadataItemsFromArray:asset.commonMetadata
                                                                             withKey:AVMetadataCommonKeyArtwork
                                                                            keySpace:AVMetadataKeySpaceCommon];
        for (AVMetadataItem *item in artworks) {
            NSData *artData = item.dataValue;
            if (!artData && [item.value isKindOfClass:[NSData class]]) {
                artData = (NSData *)item.value;
            } else if (!artData && [item.value isKindOfClass:[NSDictionary class]]) {
                NSDictionary *dict = (NSDictionary *)item.value;
                if ([dict[@"data"] isKindOfClass:[NSData class]]) {
                    artData = dict[@"data"];
                }
            }
            if (artData && artData.length > 0) {
                NSImage *nsImg = [[NSImage alloc] initWithData:artData];
                if (nsImg) {
                    NSRect rect = NSMakeRect(0, 0, nsImg.size.width, nsImg.size.height);
                    CGImageRef cgArt = [nsImg CGImageForProposedRect:&rect context:nil hints:nil];
                    if (cgArt) {
                        if (*outWidth <= 0 || *outHeight <= 0) {
                            *outWidth = (int)CGImageGetWidth(cgArt);
                            *outHeight = (int)CGImageGetHeight(cgArt);
                        }
                        NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:cgArt];
                        NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                        if (pngData && pngData.length > 0) {
                            *outLength = (int)pngData.length;
                            void *buf = malloc(pngData.length);
                            memcpy(buf, pngData.bytes, pngData.length);
                            return buf;
                        }
                    }
                }
            }
        }

        // 3. Priority 2: Extract first video frame via AVAssetImageGenerator
        AVAssetImageGenerator *generator = [[AVAssetImageGenerator alloc] initWithAsset:asset];
        generator.appliesPreferredTrackTransform = YES;
        generator.requestedTimeToleranceBefore = kCMTimePositiveInfinity;
        generator.requestedTimeToleranceAfter = kCMTimePositiveInfinity;

        NSError *error = nil;
        CMTime actualTime;
        CGImageRef cgImg = [generator copyCGImageAtTime:CMTimeMake(0, 600) actualTime:&actualTime error:&error];
        #pragma clang diagnostic pop

        if (!cgImg) {
            return NULL;
        }

        int frameW = (int)CGImageGetWidth(cgImg);
        int frameH = (int)CGImageGetHeight(cgImg);
        if (*outWidth <= 0 || *outHeight <= 0) {
            *outWidth = frameW;
            *outHeight = frameH;
        }

        NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:cgImg];
        CGImageRelease(cgImg);
        if (!rep) {
            return NULL;
        }

        NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        if (!pngData || pngData.length == 0) {
            return NULL;
        }

        *outLength = (int)pngData.length;
        void *buffer = malloc(pngData.length);
        memcpy(buffer, pngData.bytes, pngData.length);
        return buffer;
    }
}
*/
import "C"
import (
	"bytes"
	"image"
	_ "image/png"
	"unsafe"
)

// ExtractNativeVideoFrame attempts to extract the embedded cover artwork or first frame
// of a video file using native OS media APIs (AVFoundation on macOS).
func ExtractNativeVideoFrame(filePath string) (image.Image, int, int) {
	if filePath == "" {
		return nil, 0, 0
	}
	cPath := C.CString(filePath)
	defer C.free(unsafe.Pointer(cPath))

	var length C.int
	var width C.int
	var height C.int
	ptr := C.extractVideoCoverOrFirstFramePNG(cPath, &length, &width, &height)
	if ptr == nil || length <= 0 {
		return nil, int(width), int(height)
	}
	defer C.free(ptr)

	pngBytes := C.GoBytes(ptr, length)
	img, _, err := image.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		return nil, int(width), int(height)
	}
	w := int(width)
	h := int(height)
	if w <= 0 || h <= 0 {
		b := img.Bounds()
		w = b.Dx()
		h = b.Dy()
	}
	return img, w, h
}
