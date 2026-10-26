import '../models/item.dart';
import '../services/api_service.dart';
import '../services/item_query.dart';
import 'api_items.dart';
import 'api_metadata.dart';

/// 一次分页请求的结果。
typedef ItemPage = ({int total, List<MobileItem> items});

/// 主列表的分页数据源。
///
/// 把「当前视图 → 该请求哪个接口」的知识从 `HomeScreen` 抽出来，
/// 让页面只关心展示与交互。三种数据来源：
///  · 废纸篓：专用接口（这些条目不在查询引擎里）
///  · 使用历史：本地 id 列表，按 id 逐个补全
///  · 其余（全部 / 未打标签 / 未分类 / 文件夹）：查询接口
class GalleryFeed {
  const GalleryFeed({
    required this.query,
    required this.isTrash,
    required this.isHistory,
    required this.historyIds,
    this.pageSize = 60,
  });

  final ItemQuery query;
  final bool isTrash;
  final bool isHistory;
  final List<String> historyIds;
  final int pageSize;

  /// 拉取一页；[cached] 用于使用历史视图复用已加载的条目，避免重复请求。
  Future<ItemPage> fetch(int offset, {List<MobileItem> cached = const []}) async {
    if (isTrash) {
      return ApiService.instance.getCollectionItems(
        collection: LibraryCollection.trash,
        limit: pageSize,
        offset: offset,
      );
    }
    if (isHistory) {
      return _fetchHistory(offset, cached, limit: pageSize);
    }
    return ApiService.instance.queryItems(
      query: query,
      limit: pageSize,
      offset: offset,
    );
  }

  /// 一次性取回最多 [limit] 条（ws 刷新时用于保持滚动深度）。
  Future<ItemPage> fetchWindow(int limit) async {
    if (isTrash) {
      return ApiService.instance.getCollectionItems(
        collection: LibraryCollection.trash,
        limit: limit,
        offset: 0,
      );
    }
    if (isHistory) {
      return _fetchHistory(0, const [], limit: limit);
    }
    return ApiService.instance.queryItems(query: query, limit: limit, offset: 0);
  }

  Future<ItemPage> _fetchHistory(
    int offset,
    List<MobileItem> cached, {
    required int limit,
  }) async {
    final slice = historyIds.skip(offset).take(limit).toList();
    final cachedById = {for (final it in cached) it.id: it};
    final items = <MobileItem>[];
    for (final id in slice) {
      final hit = cachedById[id];
      if (hit != null) {
        items.add(hit);
        continue;
      }
      try {
        items.add(MobileItem.fromDetail(await ApiService.instance.getItemDetail(id)));
      } catch (_) {
        // 条目可能已被删除，跳过即可
      }
    }
    return (total: historyIds.length, items: items);
  }
}
