/// 上传结果：成功数量与新建素材的 id 列表。
class UploadResult {
  const UploadResult({required this.count, this.itemIds = const []});

  final int count;
  final List<String> itemIds;
}
