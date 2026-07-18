#import <CoreImage/CoreImage.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>

static BOOL segmentImage(NSURL *inputURL, NSURL *outputURL, NSError **outputError) {
    CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)inputURL, NULL);
    if (source == NULL) {
        return NO;
    }

    CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
    CFRelease(source);
    if (image == NULL) {
        return NO;
    }

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
    VNGenerateForegroundInstanceMaskRequest *request =
        [[VNGenerateForegroundInstanceMaskRequest alloc] init];
    NSError *error = nil;
    BOOL performed = [handler performRequests:@[request] error:&error];
    if (!performed || error != nil || request.results.count == 0) {
        if (outputError != NULL) {
            *outputError = error;
        }
        CGImageRelease(image);
        return NO;
    }

    VNInstanceMaskObservation *observation = request.results.firstObject;
    CVPixelBufferRef mask = [observation
        generateScaledMaskForImageForInstances:observation.allInstances
        fromRequestHandler:handler
        error:&error];
    if (mask == NULL || error != nil) {
        if (outputError != NULL) {
            *outputError = error;
        }
        CGImageRelease(image);
        return NO;
    }

    CIImage *maskImage = [CIImage imageWithCVPixelBuffer:mask];
    CIContext *context = [CIContext contextWithOptions:@{}];
    CGImageRef outputImage = [context createCGImage:maskImage fromRect:maskImage.extent];
    CFRelease(mask);
    CGImageRelease(image);
    if (outputImage == NULL) {
        return NO;
    }

    CGImageDestinationRef destination = CGImageDestinationCreateWithURL(
        (__bridge CFURLRef)outputURL,
        CFSTR("public.png"),
        1,
        NULL
    );
    if (destination == NULL) {
        CGImageRelease(outputImage);
        return NO;
    }

    CGImageDestinationAddImage(destination, outputImage, NULL);
    BOOL saved = CGImageDestinationFinalize(destination);
    CFRelease(destination);
    CGImageRelease(outputImage);

    if (saved) {
        printf(
            "instances=%lu output=%s\n",
            (unsigned long)observation.allInstances.count,
            outputURL.path.UTF8String
        );
    }

    return saved;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 3) {
            fprintf(stderr, "Usage: segment_owl input.jpg|directory output.png|directory\n");
            return 2;
        }

        NSFileManager *fileManager = NSFileManager.defaultManager;
        NSURL *inputURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
        NSURL *outputURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]]];
        NSNumber *isDirectory = nil;
        [inputURL getResourceValue:&isDirectory forKey:NSURLIsDirectoryKey error:nil];

        if (!isDirectory.boolValue) {
            NSError *error = nil;
            if (!segmentImage(inputURL, outputURL, &error)) {
                fprintf(stderr, "Vision segmentation failed: %s\n", error.localizedDescription.UTF8String);
                return 3;
            }
            return 0;
        }

        [fileManager createDirectoryAtURL:outputURL
              withIntermediateDirectories:YES
                               attributes:nil
                                    error:nil];
        NSArray<NSURL *> *files = [[fileManager
            contentsOfDirectoryAtURL:inputURL
            includingPropertiesForKeys:nil
            options:NSDirectoryEnumerationSkipsHiddenFiles
            error:nil] sortedArrayUsingComparator:^NSComparisonResult(NSURL *left, NSURL *right) {
                return [left.lastPathComponent compare:right.lastPathComponent];
            }];
        NSUInteger processed = 0;

        for (NSURL *fileURL in files) {
            NSString *extension = fileURL.pathExtension.lowercaseString;
            if (![extension isEqualToString:@"jpg"] && ![extension isEqualToString:@"jpeg"]) {
                continue;
            }

            NSString *basename = fileURL.lastPathComponent.stringByDeletingPathExtension;
            NSURL *maskURL = [outputURL
                URLByAppendingPathComponent:[basename stringByAppendingPathExtension:@"png"]];
            NSError *error = nil;

            if (!segmentImage(fileURL, maskURL, &error)) {
                fprintf(
                    stderr,
                    "Vision segmentation failed for %s: %s\n",
                    fileURL.lastPathComponent.UTF8String,
                    error.localizedDescription.UTF8String
                );
                return 4;
            }

            processed += 1;
        }

        printf("processed=%lu\n", (unsigned long)processed);
    }

    return 0;
}
