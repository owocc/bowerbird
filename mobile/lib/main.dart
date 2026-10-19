import 'package:flutter/material.dart';
import 'screens/connect_screen.dart';
import 'screens/home_screen.dart';
import 'services/api_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiService.instance.init();
  runApp(const BowerbirdMobileApp());
}

class BowerbirdMobileApp extends StatelessWidget {
  const BowerbirdMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFF1E88E5);

    return MaterialApp(
      title: 'Bowerbird',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryColor,
          brightness: Brightness.light,
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryColor,
          brightness: Brightness.dark,
        ),
      ),
      home: ApiService.instance.isConfigured
          ? const HomeScreen()
          : const ConnectScreen(),
    );
  }
}
