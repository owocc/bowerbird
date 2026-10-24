import 'dart:async';
import 'dart:convert';
import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'app_keys.dart';
import 'screens/connect_screen.dart';
import 'screens/home_screen.dart';
import 'services/api_service.dart';
import 'theme/app_theme.dart';
import 'services/inbox_service.dart';
import 'services/share_tag_service.dart';
import 'services/share_intent_handler.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiService.instance.init();
  try {
    await InboxService.instance.init();
  } catch (_) {
    // Share intake stays disabled if the app data directory is unavailable;
    // the rest of the app (pairing, browsing) must still start.
  }
  await ShareTagService.instance.init();
  runApp(const BowerbirdMobileApp());
}

class BowerbirdMobileApp extends StatefulWidget {
  const BowerbirdMobileApp({super.key});

  @override
  State<BowerbirdMobileApp> createState() => _BowerbirdMobileAppState();
}

class _BowerbirdMobileAppState extends State<BowerbirdMobileApp>
    with WidgetsBindingObserver {
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ShareIntentHandler.instance.attach();
    _initDeepLinks();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ShareIntentHandler.instance.processPending();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _linkSub?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ShareIntentHandler.instance.processPending();
    }
  }

  Future<void> _initDeepLinks() async {
    _appLinks = AppLinks();

    // Handle initial link if app opened via link
    try {
      final initialUri = await _appLinks.getInitialLink();
      if (initialUri != null) {
        _handleIncomingUri(initialUri);
      }
    } catch (_) {}

    // Listen to incoming links while app is open / foregrounded
    _linkSub = _appLinks.uriLinkStream.listen(
      (uri) => _handleIncomingUri(uri),
      onError: (_) {},
    );
  }

  Future<void> _handleIncomingUri(Uri uri) async {
    if (uri.scheme == 'bowerbird' && uri.host == 'pair') {
      final dataParam = uri.queryParameters['data'];
      if (dataParam == null || dataParam.isEmpty) return;
      try {
        final payload = jsonDecode(dataParam) as Map<String, dynamic>;
        final ips = (payload['ips'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [];
        final port = (payload['port'] as num?)?.toInt() ?? 17878;
        final code = payload['code']?.toString() ?? '';

        if (ips.isEmpty) return;

        String? responsiveHost;
        for (final ip in ips) {
          final host = 'http://$ip:$port';
          try {
            final res = await http.get(Uri.parse('$host/api/v1/status')).timeout(const Duration(seconds: 3));
            if (res.statusCode == 200) {
              responsiveHost = host;
              break;
            }
          } catch (_) {}
        }

        if (responsiveHost != null && code.isNotEmpty) {
          await ApiService.instance.pair(
            host: responsiveHost,
            code: code,
            deviceName: 'App Link Companion',
          );
          navigatorKey.currentState?.pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const HomeScreen()),
            (route) => false,
          );
        }
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      scaffoldMessengerKey: scaffoldMessengerKey,
      title: 'Bowerbird',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: ApiService.instance.isConfigured
          ? const HomeScreen()
          : const ConnectScreen(),
    );
  }
}
