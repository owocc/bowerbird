import 'package:flutter/material.dart';

/// App-wide keys so background services (share intake, upload feedback) can
/// navigate and show messages without holding a widget context.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey =
    GlobalKey<ScaffoldMessengerState>();
