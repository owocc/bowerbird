import '../models/item.dart';
import '../services/api_service.dart';
import '../services/api_metadata.dart';
import 'api_upload.dart';

/// 一次动作的结果：成功/失败 + 给用户看的消息。
class ActionResult {
  const ActionResult(this.message, {this.ok = true});
  const ActionResult.failure(this.message) : ok = false;

  final String message;
  final bool ok;
}

/// 主界面的批量与废纸篓动作。
///
/// 抽出来的原因：这些是「对多个 id 做同一件事 + 汇总结果」的纯逻辑，
/// 不涉及 UI。页面只需要展示 [ActionResult.message]。
class GalleryActions {
  const GalleryActions._();

  /// 把多个素材加入同一文件夹。
  static Future<ActionResult> addToFolder(
    Iterable<String> itemIds,
    MobileFolder folder,
  ) async {
    try {
      for (final id in itemIds) {
        await ApiService.instance.addItemToFolder(id, folder.id);
      }
      return ActionResult('已添加到「${folder.name}」');
    } catch (e) {
      return ActionResult.failure('添加失败: ${_clean(e)}');
    }
  }

  /// 给多个素材打同一标签。
  static Future<ActionResult> addTag(Iterable<String> itemIds, String tag) async {
    try {
      for (final id in itemIds) {
        await ApiService.instance.addTagToItem(id, tag);
      }
      return ActionResult('已添加标签「$tag」');
    } catch (e) {
      return ActionResult.failure('添加标签失败: ${_clean(e)}');
    }
  }

  /// 从废纸篓恢复单个素材。
  static Future<ActionResult> restore(MobileItem item) async {
    try {
      await ApiService.instance.restoreItem(item.id);
      return const ActionResult('已从废纸篓恢复');
    } catch (e) {
      return ActionResult.failure('恢复失败: ${_clean(e)}');
    }
  }

  /// 清空废纸篓。
  static Future<ActionResult> emptyTrash() async {
    try {
      await ApiService.instance.emptyTrash();
      return const ActionResult('废纸篓已清空');
    } catch (e) {
      return ActionResult.failure('清空失败: ${_clean(e)}');
    }
  }

  /// 上传本地文件到当前资料库，返回上传数量。
  static Future<({int count, String? error})> upload(List<String> paths) async {
    try {
      final result = await ApiService.instance.uploadFiles(paths);
      return (count: result.count, error: null);
    } catch (e) {
      return (count: 0, error: _clean(e));
    }
  }

  static String _clean(Object e) => e.toString().replaceAll('Exception: ', '');
}
