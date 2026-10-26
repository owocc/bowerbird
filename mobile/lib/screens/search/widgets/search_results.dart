import 'package:flutter/material.dart';

import '../../../models/item.dart';
import '../../../services/api_service.dart';
import '../../../services/share_tag_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/share_tag_badge.dart';

/// 搜索结果网格：加载中 / 错误 / 空 / 宫格。
///
/// 从 `SearchScreen._buildBody` 抽出，页面只剩状态与请求。
class SearchResults extends StatelessWidget {
  const SearchResults({
    super.key,
    required this.results,
    required this.isLoading,
    required this.errorMessage,
    required this.scrollController,
    required this.onRetry,
    required this.onOpenItem,
  });

  final List<MobileItem> results;
  final bool isLoading;
  final String? errorMessage;
  final ScrollController scrollController;
  final VoidCallback onRetry;
  final void Function(int index) onOpenItem;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (isLoading) return const Center(child: CircularProgressIndicator());
    if (errorMessage != null) return _errorState(theme);
    if (results.isEmpty) return _emptyState(theme);

    return GridView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
        childAspectRatio: 1,
      ),
      itemCount: results.length,
      itemBuilder: (context, index) => _tile(theme, results[index], index),
    );
  }

  Widget _errorState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 12),
            Text('Search Error', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              errorMessage!,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Try Again')),
          ],
        ),
      ),
    );
  }

  Widget _emptyState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          '没有匹配的素材',
          style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.outline,
            fontWeight: FontWeight.w400,
          ),
        ),
      ),
    );
  }

  Widget _tile(ThemeData theme, MobileItem item, int index) {
    return InkWell(
      onTap: () => onOpenItem(index),
      borderRadius: BorderRadius.circular(AppRadii.card),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.card),
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
                const Positioned(top: 4, left: 4, child: _Badge(text: 'GIF')),
              if (item.isVideo)
                const Positioned(
                  bottom: 4,
                  right: 4,
                  child: _Badge(icon: Icons.play_arrow),
                ),
              if (ShareTagService.instance.isMarked(item.id))
                const Positioned(left: 4, bottom: 4, child: ShareTagBadge()),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({this.text, this.icon});

  final String? text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: text != null
          ? const EdgeInsets.symmetric(horizontal: 4, vertical: 1)
          : const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(AppRadii.chipSmall),
      ),
      child: text != null
          ? Text(
              text!,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 9,
                fontWeight: FontWeight.w500,
              ),
            )
          : Icon(icon, size: 14, color: Colors.white),
    );
  }
}
