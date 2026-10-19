import 'package:flutter/material.dart';
import '../models/item.dart';
import '../services/api_service.dart';
import 'detail_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _searchController = TextEditingController();
  final List<MobileItem> _results = [];
  bool _isLoading = false;
  String _selectedType = '';
  String _selectedOrientation = '';
  String? _errorMessage;

  final List<({String label, String value})> _typeFilters = const [
    (label: 'All Types', value: ''),
    (label: 'Images', value: 'image'),
    (label: 'Videos', value: 'video'),
    (label: 'Audio', value: 'audio'),
  ];

  final List<({String label, String value})> _orientationFilters = const [
    (label: 'All Orientations', value: ''),
    (label: 'Landscape', value: 'landscape'),
    (label: 'Portrait', value: 'portrait'),
    (label: 'Square', value: 'square'),
  ];

  @override
  void initState() {
    super.initState();
    _performSearch();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _performSearch() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await ApiService.instance.getItems(
        limit: 100,
        offset: 0,
        q: _searchController.text.trim(),
        type: _selectedType.isNotEmpty ? _selectedType : null,
        orientation: _selectedOrientation.isNotEmpty ? _selectedOrientation : null,
      );

      if (mounted) {
        setState(() {
          _results.clear();
          _results.addAll(res.items);
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString().replaceAll('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _searchController,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _performSearch(),
          decoration: InputDecoration(
            hintText: 'Search items, tags, notes...',
            border: InputBorder.none,
            suffixIcon: _searchController.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear),
                    onPressed: () {
                      _searchController.clear();
                      _performSearch();
                    },
                  )
                : null,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: _performSearch,
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Chips Row
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              border: Border(bottom: BorderSide(color: theme.dividerColor.withValues(alpha: 0.2))),
            ),
            child: Column(
              children: [
                // Type filters
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _typeFilters.length,
                    separatorBuilder: (context, index) => const SizedBox(width: 8),
                    itemBuilder: (context, i) {
                      final item = _typeFilters[i];
                      final isSelected = _selectedType == item.value;
                      return ChoiceChip(
                        label: Text(item.label),
                        selected: isSelected,
                        onSelected: (val) {
                          if (val) {
                            setState(() => _selectedType = item.value);
                            _performSearch();
                          }
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 6),
                // Orientation filters
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _orientationFilters.length,
                    separatorBuilder: (context, index) => const SizedBox(width: 8),
                    itemBuilder: (context, i) {
                      final item = _orientationFilters[i];
                      final isSelected = _selectedOrientation == item.value;
                      return ChoiceChip(
                        label: Text(item.label),
                        selected: isSelected,
                        onSelected: (val) {
                          if (val) {
                            setState(() => _selectedOrientation = item.value);
                            _performSearch();
                          }
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),

          // Results Grid
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null
                    ? Center(
                        child: Text(
                          _errorMessage!,
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                      )
                    : _results.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.search_off, size: 64, color: theme.colorScheme.outline),
                                const SizedBox(height: 12),
                                Text(
                                  'No matching assets found',
                                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                                ),
                              ],
                            ),
                          )
                        : GridView.builder(
                            padding: const EdgeInsets.all(2),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 3,
                              crossAxisSpacing: 2,
                              mainAxisSpacing: 2,
                            ),
                            itemCount: _results.length,
                            itemBuilder: (context, index) {
                              final item = _results[index];

                              return GestureDetector(
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => DetailScreen(
                                        items: _results,
                                        initialIndex: index,
                                      ),
                                    ),
                                  );
                                },
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    Image.network(
                                      ApiService.instance.getThumbnailUrl(item.id),
                                      fit: BoxFit.cover,
                                      headers: ApiService.instance.authHeaders,
                                      errorBuilder: (context, error, stackTrace) {
                                        return Container(
                                          color: theme.colorScheme.surfaceContainerHighest,
                                          child: Icon(
                                            Icons.broken_image_outlined,
                                            color: theme.colorScheme.outline,
                                            size: 28,
                                          ),
                                        );
                                      },
                                    ),
                                    if (item.isVideo)
                                      Positioned(
                                        top: 4,
                                        right: 4,
                                        child: Container(
                                          padding: const EdgeInsets.all(2),
                                          decoration: BoxDecoration(
                                            color: Colors.black54,
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: const Icon(
                                            Icons.play_arrow,
                                            color: Colors.white,
                                            size: 14,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}
