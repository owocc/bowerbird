import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../models/item.dart';
import '../services/api_service.dart';

/// Streams a video item from the desktop originals endpoint (HTTP Range backed)
/// and provides play/pause plus a scrubbable progress bar.
class VideoPlayerPage extends StatefulWidget {
  const VideoPlayerPage({
    super.key,
    required this.item,
    required this.isActive,
    required this.showControls,
    this.onTap,
  });

  final MobileItem item;
  final bool isActive;
  final bool showControls;
  final VoidCallback? onTap;

  @override
  State<VideoPlayerPage> createState() => _VideoPlayerPageState();
}

class _VideoPlayerPageState extends State<VideoPlayerPage> {
  VideoPlayerController? _controller;
  bool _initializing = false;
  String? _error;
  int _lastPositionSecond = -1;

  @override
  void initState() {
    super.initState();
    if (widget.isActive) {
      _init();
    }
  }

  @override
  void didUpdateWidget(covariant VideoPlayerPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      _init();
    } else if (!widget.isActive && oldWidget.isActive) {
      _controller?.pause();
    }
  }

  Future<void> _init() async {
    if (_controller != null || _initializing) return;
    setState(() {
      _initializing = true;
      _error = null;
    });

    final controller = VideoPlayerController.networkUrl(
      Uri.parse(ApiService.instance.getOriginalUrl(widget.item.id)),
      httpHeaders: ApiService.instance.mediaHeaders,
    );
    try {
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      controller.setLooping(false);
      controller.addListener(_onControllerTick);
      setState(() {
        _controller = controller;
        _initializing = false;
      });
    } catch (_) {
      await controller.dispose();
      if (mounted) {
        setState(() {
          _initializing = false;
          _error = '该视频格式暂不支持播放';
        });
      }
    }
  }

  void _onControllerTick() {
    final controller = _controller;
    if (controller == null) return;
    final second = controller.value.position.inSeconds;
    if (second != _lastPositionSecond) {
      _lastPositionSecond = second;
      if (mounted) setState(() {});
    }
  }

  @override
  void dispose() {
    _controller?.removeListener(_onControllerTick);
    _controller?.pause();
    _controller?.dispose();
    super.dispose();
  }

  void _togglePlay() {
    final controller = _controller;
    if (controller == null) return;
    final value = controller.value;
    if (value.isPlaying) {
      controller.pause();
    } else {
      if (value.position >= value.duration) {
        controller.seekTo(Duration.zero);
      }
      controller.play();
    }
    setState(() {});
  }

  static String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      child: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.videocam_off_outlined, size: 64, color: Colors.white54),
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 8),
              Text(
                widget.item.filename,
                style: const TextStyle(color: Colors.white38, fontSize: 12),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              const Text(
                '可尝试分享或下载后用其他播放器打开',
                style: TextStyle(color: Colors.white38, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return Stack(
        fit: StackFit.expand,
        children: [
          Image.network(
            ApiService.instance.getThumbnailUrl(widget.item.id),
            headers: ApiService.instance.mediaHeaders,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
          Center(
            child: _initializing
                ? const CircularProgressIndicator(color: Colors.white)
                : const Icon(Icons.play_circle_outline, size: 72, color: Colors.white70),
          ),
        ],
      );
    }

    final value = controller.value;
    return Stack(
      fit: StackFit.expand,
      children: [
        Center(
          child: AspectRatio(
            aspectRatio: value.aspectRatio,
            child: VideoPlayer(controller),
          ),
        ),
        if (widget.showControls) ...[
          Center(
            child: GestureDetector(
              onTap: _togglePlay,
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.black54,
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(10),
                child: Icon(
                  value.isPlaying ? Icons.pause : Icons.play_arrow,
                  color: Colors.white,
                  size: 40,
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 96,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black45,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  VideoProgressIndicator(
                    controller,
                    allowScrubbing: true,
                    colors: const VideoProgressColors(
                      playedColor: Colors.white,
                      bufferedColor: Colors.white38,
                      backgroundColor: Colors.white24,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        _formatDuration(value.position),
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                      const Spacer(),
                      Text(
                        _formatDuration(value.duration),
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}
