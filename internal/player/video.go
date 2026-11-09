package player

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo/ui"
)

// videoMaxDimension caps decoded frames so a 4K clip does not fill the GPU
// cache with raw RGBA images on every frame.
const videoMaxDimension = 1280

// VideoInfo describes the decodable part of a video file.
type VideoInfo struct {
	Width    int
	Height   int
	FPS      float64
	Duration time.Duration
}

// VideoPlayer is the native video playback kernel used by ui_preview.go. Video
// frames go through ffmpeg into mygo's ui.VideoPlayer; audio is extracted once
// to a temporary WAV and played through mygo's audio output. No WebView or
// HTML media element is involved.
type VideoPlayer struct {
	mu          sync.Mutex
	path        string
	info        VideoInfo
	ui          *ui.VideoPlayer
	audio       *Player
	audioPath   string
	audioCancel context.CancelFunc
	pos         time.Duration
	started     time.Time
	playing     bool
	closed      bool
}

// ProbeVideo reads stream dimensions, frame rate and duration with ffprobe.
// fallbackWidth/fallbackHeight come from the library index, which already
// extracts video dimensions natively on macOS.
func ProbeVideo(path string, fallbackWidth, fallbackHeight int) VideoInfo {
	info := VideoInfo{Width: fallbackWidth, Height: fallbackHeight, FPS: 30}
	cmd := exec.Command("ffprobe", "-v", "error", "-select_streams", "v:0",
		"-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,duration:format=duration",
		"-of", "json", path)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return info
	}
	var payload struct {
		Streams []struct {
			Width        int    `json:"width"`
			Height       int    `json:"height"`
			AvgFrameRate string `json:"avg_frame_rate"`
			RFrameRate   string `json:"r_frame_rate"`
			Duration     string `json:"duration"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if json.Unmarshal(out.Bytes(), &payload) != nil || len(payload.Streams) == 0 {
		return info
	}
	s := payload.Streams[0]
	if s.Width > 0 && s.Height > 0 {
		info.Width, info.Height = s.Width, s.Height
	}
	if fps := parseRate(s.AvgFrameRate); fps > 0 {
		info.FPS = fps
	} else if fps := parseRate(s.RFrameRate); fps > 0 {
		info.FPS = fps
	}
	for _, raw := range []string{s.Duration, payload.Format.Duration} {
		if seconds, err := strconv.ParseFloat(strings.TrimSpace(raw), 64); err == nil && seconds > 0 {
			info.Duration = time.Duration(seconds * float64(time.Second))
			break
		}
	}
	return info
}

func parseRate(raw string) float64 {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "0/0" {
		return 0
	}
	if num, den, ok := strings.Cut(raw, "/"); ok {
		n, errN := strconv.ParseFloat(num, 64)
		d, errD := strconv.ParseFloat(den, 64)
		if errN == nil && errD == nil && d != 0 {
			return n / d
		}
	}
	v, _ := strconv.ParseFloat(raw, 64)
	return v
}

// ExtractVideoFrame decodes an early frame for cover thumbnails. It reuses the
// same ffmpeg decoder as playback, so videos without an AVFoundation frame or
// embedded artwork still get a gallery cover on every platform.
func ExtractVideoFrame(path string, fallbackWidth, fallbackHeight int) (image.Image, int, int, error) {
	info := ProbeVideo(path, fallbackWidth, fallbackHeight)
	if info.Width <= 0 || info.Height <= 0 {
		return nil, 0, 0, errors.New("video dimensions are unknown")
	}
	startAt := time.Duration(0)
	if info.Duration <= 0 || info.Duration > 120*time.Millisecond {
		startAt = 50 * time.Millisecond
	}
	dec, err := newFFmpegDecoder(path, startAt, info)
	if err != nil {
		return nil, 0, 0, err
	}
	defer dec.Close()
	frame, err := dec.Next()
	if err != nil {
		return nil, 0, 0, err
	}
	if frame.Image == nil {
		return nil, 0, 0, errors.New("ffmpeg returned no video frame")
	}
	return frame.Image, info.Width, info.Height, nil
}

// OpenVideo starts a native video player for path.
func OpenVideo(path string, fallbackWidth, fallbackHeight int) (*VideoPlayer, error) {
	info := ProbeVideo(path, fallbackWidth, fallbackHeight)
	if info.Width <= 0 || info.Height <= 0 {
		return nil, errors.New("video dimensions are unknown; ffprobe is required for this file")
	}
	dec, err := newFFmpegDecoder(path, 0, info)
	if err != nil {
		return nil, err
	}
	native, err := ui.NewVideoPlayer(dec)
	if err != nil {
		_ = dec.Close()
		return nil, err
	}
	// Start on the first frame; opening the preview must not blast audio.
	native.Pause()
	v := &VideoPlayer{path: path, info: info, ui: native}
	go v.extractAudio()
	return v, nil
}

// Native returns the mygo player for ui.Video.
func (v *VideoPlayer) Native() *ui.VideoPlayer {
	if v == nil {
		return nil
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.ui
}

// Duration returns the media duration, or zero when unknown.
func (v *VideoPlayer) Duration() time.Duration {
	if v == nil {
		return 0
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.info.Duration
}

// Position returns the current playhead.
func (v *VideoPlayer) Position() time.Duration {
	if v == nil {
		return 0
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.positionLocked()
}

func (v *VideoPlayer) positionLocked() time.Duration {
	if !v.playing {
		return v.pos
	}
	pos := v.pos + time.Since(v.started)
	if v.info.Duration > 0 && pos > v.info.Duration {
		pos = v.info.Duration
	}
	return pos
}

// Playing reports whether the video is playing.
func (v *VideoPlayer) Playing() bool {
	if v == nil {
		return false
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.playing {
		return false
	}
	if v.info.Duration > 0 {
		return v.positionLocked() < v.info.Duration
	}
	return v.ui != nil && v.ui.Playing()
}

// Play starts or resumes video and audio.
func (v *VideoPlayer) Play() {
	if v == nil {
		return
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.closed || v.ui == nil {
		return
	}
	if v.playing {
		ended := (v.info.Duration > 0 && v.positionLocked() >= v.info.Duration) || !v.ui.Playing()
		if !ended {
			return
		}
		v.playing = false
		v.pos = 0
	}
	v.ui.Play()
	v.started = time.Now()
	v.playing = true
	if v.audio != nil {
		v.audio.Seek(v.pos)
		v.audio.Play()
	}
}

// Pause holds the video where it is.
func (v *VideoPlayer) Pause() {
	if v == nil {
		return
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.playing || v.ui == nil {
		return
	}
	v.pos = v.positionLocked()
	v.ui.Pause()
	v.playing = false
	if v.audio != nil {
		v.audio.Pause()
	}
}

// Toggle flips play and pause.
func (v *VideoPlayer) Toggle() {
	if v == nil {
		return
	}
	if v.Playing() {
		v.Pause()
	} else {
		v.Play()
	}
}

// Seek restarts frame decoding at pos. The native ui player cannot seek in
// place, so a short-lived ffmpeg decoder starts at the requested timestamp.
func (v *VideoPlayer) Seek(pos time.Duration) error {
	if v == nil {
		return nil
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.closed || v.ui == nil {
		return nil
	}
	if pos < 0 {
		pos = 0
	}
	if v.info.Duration > 0 && pos > v.info.Duration {
		pos = v.info.Duration
	}
	wasPlaying := v.playing
	dec, err := newFFmpegDecoder(v.path, pos, v.info)
	if err != nil {
		return err
	}
	native, err := ui.NewVideoPlayer(dec)
	if err != nil {
		_ = dec.Close()
		return err
	}
	old := v.ui
	v.ui = native
	v.pos, v.started, v.playing = pos, time.Now(), wasPlaying
	if wasPlaying {
		native.Play()
	} else {
		native.Pause()
	}
	if v.audio != nil {
		v.audio.Seek(pos)
		if wasPlaying {
			v.audio.Play()
		} else {
			v.audio.Pause()
		}
	}
	old.Close()
	return nil
}

// Err reports a frame-decoding error.
func (v *VideoPlayer) Err() error {
	if v == nil {
		return nil
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.ui == nil {
		return nil
	}
	return v.ui.Err()
}

// Close releases frames, audio and the temporary WAV file.
func (v *VideoPlayer) Close() {
	if v == nil {
		return
	}
	v.mu.Lock()
	if v.closed {
		v.mu.Unlock()
		return
	}
	v.closed = true
	native := v.ui
	v.ui = nil
	audio := v.audio
	v.audio = nil
	audioPath := v.audioPath
	cancel := v.audioCancel
	v.audioCancel = nil
	v.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if native != nil {
		native.Close()
	}
	if audio != nil {
		audio.Close()
	}
	if audioPath != "" {
		_ = os.Remove(audioPath)
	}
}

func (v *VideoPlayer) extractAudio() {
	tmp, err := os.CreateTemp("", "bowerbird-video-*.wav")
	if err != nil {
		return
	}
	audioPath := tmp.Name()
	_ = tmp.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	v.mu.Lock()
	if v.closed {
		v.mu.Unlock()
		_ = os.Remove(audioPath)
		return
	}
	v.audioCancel = cancel
	v.mu.Unlock()
	cmd := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-nostdin",
		"-i", v.path, "-vn", "-ac", "2", "-ar", "44100", "-f", "wav", audioPath)
	if err := cmd.Run(); err != nil {
		_ = os.Remove(audioPath)
		return
	}
	audio, err := Open(audioPath)
	if err != nil {
		_ = os.Remove(audioPath)
		return
	}

	v.mu.Lock()
	if v.closed {
		v.mu.Unlock()
		audio.Close()
		_ = os.Remove(audioPath)
		return
	}
	v.audio, v.audioPath = audio, audioPath
	v.audioCancel = nil
	playing, pos := v.playing, v.positionLocked()
	v.mu.Unlock()

	if pos > 0 {
		audio.Seek(pos)
	}
	if playing {
		audio.Play()
	} else {
		audio.Pause()
	}
}

// ffmpegDecoder implements ui.VideoDecoder by reading raw RGBA frames from an
// ffmpeg subprocess.
type ffmpegDecoder struct {
	path      string
	startAt   time.Duration
	info      VideoInfo
	width     int
	height    int
	frameDur  time.Duration
	cmd       *exec.Cmd
	stdout    io.ReadCloser
	stderr    bytes.Buffer
	buf       []byte
	closeOnce sync.Once
}

func newFFmpegDecoder(path string, startAt time.Duration, info VideoInfo) (*ffmpegDecoder, error) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return nil, errors.New("ffmpeg is not installed; native video playback needs ffmpeg")
	}
	w, h := scaledVideoSize(info.Width, info.Height)
	if w <= 0 || h <= 0 {
		return nil, errors.New("invalid video dimensions")
	}
	fps := info.FPS
	if fps <= 0 {
		fps = 30
	}
	frameDur := time.Duration(float64(time.Second) / fps)
	if frameDur < 10*time.Millisecond {
		frameDur = 10 * time.Millisecond
	}
	if frameDur > time.Second {
		frameDur = time.Second
	}
	d := &ffmpegDecoder{path: path, startAt: startAt, info: info, width: w, height: h, frameDur: frameDur}
	if err := d.start(); err != nil {
		return nil, err
	}
	return d, nil
}

func scaledVideoSize(width, height int) (int, int) {
	if width <= 0 || height <= 0 {
		return 0, 0
	}
	if width <= videoMaxDimension && height <= videoMaxDimension {
		return even(width), even(height)
	}
	scale := float64(videoMaxDimension) / float64(maxInt(width, height))
	return even(int(float64(width)*scale + 0.5)), even(int(float64(height)*scale + 0.5))
}

func even(v int) int {
	if v < 2 {
		return 2
	}
	if v%2 != 0 {
		v--
	}
	return v
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (d *ffmpegDecoder) start() error {
	args := []string{"-hide_banner", "-loglevel", "error", "-nostdin"}
	if d.startAt > 0 {
		args = append(args, "-ss", strconv.FormatFloat(d.startAt.Seconds(), 'f', 3, 64))
	}
	args = append(args,
		"-i", d.path,
		"-an", "-sn", "-dn",
		"-vf", fmt.Sprintf("scale=%d:%d", d.width, d.height),
		"-pix_fmt", "rgba",
		"-f", "rawvideo", "pipe:1",
	)
	cmd := exec.Command("ffmpeg", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	d.cmd = cmd
	d.stdout = stdout
	d.stderr.Reset()
	cmd.Stderr = &d.stderr
	if err := cmd.Start(); err != nil {
		d.stdout = nil
		d.cmd = nil
		return err
	}
	d.buf = make([]byte, d.width*d.height*4)
	return nil
}

func (d *ffmpegDecoder) Next() (ui.VideoFrame, error) {
	if d.stdout == nil {
		return ui.VideoFrame{}, io.EOF
	}
	if _, err := io.ReadFull(d.stdout, d.buf); err != nil {
		d.stop()
		if errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.EOF) {
			return ui.VideoFrame{}, io.EOF
		}
		return ui.VideoFrame{}, err
	}
	pix := make([]byte, len(d.buf))
	copy(pix, d.buf)
	img := &image.RGBA{Pix: pix, Stride: d.width * 4, Rect: image.Rect(0, 0, d.width, d.height)}
	return ui.VideoFrame{Image: img, Duration: d.frameDur}, nil
}

func (d *ffmpegDecoder) Rewind() error {
	d.stop()
	d.closeOnce = sync.Once{}
	d.startAt = 0
	return d.start()
}

func (d *ffmpegDecoder) Close() error {
	d.stop()
	return nil
}

func (d *ffmpegDecoder) stop() {
	d.closeOnce.Do(func() {
		if d.stdout != nil {
			_ = d.stdout.Close()
			d.stdout = nil
		}
		if d.cmd != nil && d.cmd.Process != nil {
			_ = d.cmd.Process.Kill()
		}
		if d.cmd != nil {
			_ = d.cmd.Wait()
			d.cmd = nil
		}
	})
}
