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
  String? _selectedTag;
  String? _selectedFolderId;
  String? _selectedColor;
  String? _errorMessage;

  List<MobileTag> _availableTags = [];
  List<MobileFolder> _availableFolders = [];
  List<String> _availableColors = [];

  final List<({String label, String value})> _typeFilters = const [
    (label: 'All Types', value: ''),
    (label: 'Images', value: 'image'),
    (label: 'Videos', value: 'video'),
    (label: 'Audio', value: 'audio'),
    (label: 'Documents', value: 'document'),
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
    _loadMetadata();
    _performSearch();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadMetadata() async {
    try {
      final tagsFuture = ApiService.instance.getTags();
      final foldersFuture = ApiService.instance.getFolders();
      final colorsFuture = ApiService.instance.getColors();

      final results = await Future.wait([tagsFuture, foldersFuture, colorsFuture]);
      if (mounted) {
        setState(() {
          _availableTags = results[0] as List<MobileTag>;
          _availableFolders = results[1] as List<MobileFolder>;
          _availableColors = results[2] as List<String>;
        });
      }
    } catch (_) {}
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
        tag: _selectedTag,
        folder: _selectedFolderId,
        color: _selectedColor,
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

  void _clearAllFilters() {
    setState(() {
      _searchController.clear();
      _selectedType = '';
      _selectedOrientation = '';
      _selectedTag = null;
      _selectedFolderId = null;
      _selectedColor = null;
    });
    _performSearch();
  }

  bool get _hasActiveFilters =>
      _searchController.text.isNotEmpty ||
      _selectedType.isNotEmpty ||
      _selectedOrientation.isNotEmpty ||
      _selectedTag != null ||
      _selectedFolderId != null ||
      _selectedColor != null;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _searchController,
          autofocus: false,
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
          if (_hasActiveFilters)
            IconButton(
              icon: const Icon(Icons.filter_alt_off),
              tooltip: 'Reset Filters',
              onPressed: _clearAllFilters,
            ),
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: _performSearch,
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Chips Section
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              border: Border(bottom: BorderSide(color: theme.dividerColor.withValues(alpha: 0.2))),
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Type filters
                  SizedBox(
                    height: 34,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _typeFilters.length,
                      separatorBuilder: (context, index) => const SizedBox(width: 8),
                      itemBuilder: (context, i) {
                        final item = _typeFilters[i];
                        final isSelected = _selectedType == item.value;
                        return ChoiceChip(
                          label: Text(item.label),
                          labelStyle: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal),
                          selected: isSelected,
                          visualDensity: VisualDensity.compact,
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
                    height: 34,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _orientationFilters.length,
                      separatorBuilder: (context, index) => const SizedBox(width: 8),
                      itemBuilder: (context, i) {
                        final item = _orientationFilters[i];
                        final isSelected = _selectedOrientation == item.value;
                        return ChoiceChip(
                          label: Text(item.label),
                          labelStyle: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal),
                          selected: isSelected,
                          visualDensity: VisualDensity.compact,
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
                  if (_availableColors.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    // Colors filter
                    SizedBox(
                      height: 32,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _availableColors.length + 1,
                        separatorBuilder: (context, index) => const SizedBox(width: 6),
                        itemBuilder: (context, i) {
                          if (i == 0) {
                            final isSelected = _selectedColor == null;
                            return ChoiceChip(
                              label: const Text('All Colors'),
                              labelStyle: const TextStyle(fontSize: 11),
                              selected: isSelected,
                              visualDensity: VisualDensity.compact,
                              onSelected: (_) {
                                setState(() => _selectedColor = null);
                                _performSearch();
                              },
                            );
                          }
                          final hex = _availableColors[i - 1];
                          final isSelected = _selectedColor == hex;
                          final color = _parseColor(hex);
                          return InkWell(
                            onTap: () {
                              setState(() {
                                _selectedColor = isSelected ? null : hex;
                              });
                              _performSearch();
                            },
                            borderRadius: BorderRadius.circular(16),
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                color: color,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: isSelected ? theme.colorScheme.primary : Colors.white24,
                                  width: isSelected ? 3 : 1,
                                ),
                                boxShadow: isSelected
                                    ? [
                                        BoxShadow(
                                          color: theme.colorScheme.primary.withValues(alpha: 0.4),
                                          blurRadius: 4,
                                          spreadRadius: 1,
                                        ),
                                      ]
                                    : null,
                              ),
                              child: isSelected
                                  ? Icon(
                                      Icons.check,
                                      size: 14,
                                      color: color.computeLuminance() > 0.5 ? Colors.black : Colors.white,
                                    )
                                  : null,
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                  if (_availableFolders.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    // Folders filter
                    SizedBox(
                      height: 32,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _availableFolders.length + 1,
                        separatorBuilder: (context, index) => const SizedBox(width: 6),
                        itemBuilder: (context, i) {
                          if (i == 0) {
                            return ChoiceChip(
                              avatar: const Icon(Icons.folder, size: 14),
                              label: const Text('All Folders'),
                              labelStyle: const TextStyle(fontSize: 11),
                              selected: _selectedFolderId == null,
                              visualDensity: VisualDensity.compact,
                              onSelected: (_) {
                                setState(() => _selectedFolderId = null);
                                _performSearch();
                              },
                            );
                          }
                          final folder = _availableFolders[i - 1];
                          final isSelected = _selectedFolderId == folder.id;
                          return ChoiceChip(
                            avatar: const Icon(Icons.folder_outlined, size: 14),
                            label: Text('${folder.name} (${folder.itemCount})'),
                            labelStyle: const TextStyle(fontSize: 11),
                            selected: isSelected,
                            visualDensity: VisualDensity.compact,
                            onSelected: (val) {
                              setState(() => _selectedFolderId = val ? folder.id : null);
                              _performSearch();
                            },
                          );
                        },
                      ),
                    ),
                  ],
                  if (_availableTags.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    // Tags filter
                    SizedBox(
                      height: 32,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _availableTags.length + 1,
                        separatorBuilder: (context, index) => const SizedBox(width: 6),
                        itemBuilder: (context, i) {
                          if (i == 0) {
                            return ChoiceChip(
                              avatar: const Icon(Icons.tag, size: 14),
                              label: const Text('All Tags'),
                              labelStyle: const TextStyle(fontSize: 11),
                              selected: _selectedTag == null,
                              visualDensity: VisualDensity.compact,
                              onSelected: (_) {
                                setState(() => _selectedTag = null);
                                _performSearch();
                              },
                            );
                          }
                          final tag = _availableTags[i - 1];
                          final isSelected = _selectedTag == tag.name;
                          return ChoiceChip(
                            avatar: const Icon(Icons.label_outline, size: 14),
                            label: Text('${tag.name} (${tag.itemCount})'),
                            labelStyle: const TextStyle(fontSize: 11),
                            selected: isSelected,
                            visualDensity: VisualDensity.compact,
                            onSelected: (val) {
                              setState(() => _selectedTag = val ? tag.name : null);
                              _performSearch();
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Search Results Counter
          if (!_isLoading)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              alignment: Alignment.centerLeft,
              child: Text(
                'Found ${_results.length} items',
                style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),

          // Results Grid / State
          Expanded(
            child: _buildBody(theme),
          ),
        ],
      ),
    );
  }

  Color _parseColor(String hex) {
    try {
      final clean = hex.replaceAll('#', '').trim();
      if (clean.length == 6) {
        return Color(int.parse('FF$clean', radix: 16));
      }
    } catch (_) {}
    return Colors.grey;
  }

  Widget _buildBody(ThemeData theme) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              Text(
                'Search Error',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: _performSearch,
                child: const Text('Try Again'),
              ),
            ],
          ),
        ),
      );
    }

    if (_results.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, size: 64, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(
              'No matching items',
              style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 6),
            Text(
              'Try adjusting your search keywords or active filters',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 6,
        mainAxisSpacing: 6,
        childAspectRatio: 1.0,
      ),
      itemCount: _results.length,
      itemBuilder: (context, index) {
        final item = _results[index];
        return InkWell(
          onTap: () async {
            final deleted = await Navigator.of(context).push<bool>(
              MaterialPageRoute(
                builder: (_) => DetailScreen(
                  items: _results,
                  initialIndex: index,
                ),
              ),
            );
            if (deleted == true && mounted && context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('已移入废纸篓')),
              );
              _performSearch();
            }
          },
          borderRadius: BorderRadius.circular(8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Container(
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    ApiService.instance.getThumbnailUrl(item.id),
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => const Center(
                      child: Icon(Icons.broken_image, size: 28, color: Colors.grey),
                    ),
                  ),
                  if (item.isGif)
                    Positioned(
                      top: 4,
                      left: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'GIF',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  if (item.isVideo)
                    Positioned(
                      bottom: 4,
                      right: 4,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Icon(Icons.play_arrow, size: 14, color: Colors.white),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
