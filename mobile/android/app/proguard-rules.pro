# Flutter Wrapper & Plugins
-dontwarn com.google.android.play.core.**

-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# App Package & MainActivity
-keep class com.bowerbird.bowerbird_mobile.** { *; }
-keep class com.bowerbird.mobile.** { *; }

# mobile_scanner Plugin
-keep class dev.steenbakker.mobile_scanner.** { *; }
-dontwarn dev.steenbakker.mobile_scanner.**

# CameraX Framework
-keep class androidx.camera.core.** { *; }
-dontwarn androidx.camera.core.**
-keep class androidx.camera.camera2.** { *; }
-dontwarn androidx.camera.camera2.**
-keep class androidx.camera.lifecycle.** { *; }
-dontwarn androidx.camera.lifecycle.**
-keep class androidx.camera.view.** { *; }
-dontwarn androidx.camera.view.**
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# Google ML Kit Barcode Scanning
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.vision.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-keep class com.google.android.libraries.barhopper.** { *; }
-keep class com.google.photos.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.**

# Enum Serialization
-keepclassmembers class * extends java.lang.Enum {
    <fields>;
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
