// Package player is the native audio playback core used by the preview layer.
// It uses mygo's audio output and decoders, so no web media element is needed.
package player

import (
	"os"
	"sync"
	"time"

	"github.com/egoist/mygo/audio"
)

// Player wraps a mygo audio stream with the small amount of state the UI needs.
type Player struct {
	mu      sync.Mutex
	file    *os.File
	stream  *audio.Player
	path    string
	playing bool
	volume  float64
	err     error
}

// Open starts a paused stream for path. WAV, MP3 and Ogg Vorbis decode out of
// the box. Unsupported formats report an error the preview shows inline.
func Open(path string) (*Player, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	p, err := audio.OpenStream(f)
	if err != nil {
		f.Close()
		return nil, err
	}
	p.SetVolume(0.9)
	return &Player{file: f, stream: p, path: path, volume: 0.9}, nil
}

// Play starts or resumes playback.
func (p *Player) Play() {
	if p == nil || p.stream == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stream.Play()
	p.playing = true
}

// Pause pauses playback.
func (p *Player) Pause() {
	if p == nil || p.stream == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stream.Pause()
	p.playing = false
}

// Toggle flips play and pause.
func (p *Player) Toggle() {
	if p == nil {
		return
	}
	p.mu.Lock()
	playing := p.playing
	p.mu.Unlock()
	if playing {
		p.Pause()
	} else {
		p.Play()
	}
}

// Stop pauses and rewinds.
func (p *Player) Stop() {
	if p == nil || p.stream == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stream.Stop()
	p.playing = false
}

// Seek moves to t.
func (p *Player) Seek(t time.Duration) {
	if p == nil || p.stream == nil {
		return
	}
	p.stream.Seek(t)
}

// Position returns the current playback position.
func (p *Player) Position() time.Duration {
	if p == nil || p.stream == nil {
		return 0
	}
	return p.stream.Position()
}

// Duration returns the track length, or zero when unknown.
func (p *Player) Duration() time.Duration {
	if p == nil || p.stream == nil {
		return 0
	}
	return p.stream.Duration()
}

// Playing reports whether audio is currently playing.
func (p *Player) Playing() bool {
	if p == nil || p.stream == nil {
		return false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.playing && p.stream.Playing()
}

// SetVolume sets gain in [0, 1].
func (p *Player) SetVolume(v float64) {
	if p == nil || p.stream == nil {
		return
	}
	if v < 0 {
		v = 0
	}
	if v > 1 {
		v = 1
	}
	p.mu.Lock()
	p.volume = v
	p.stream.SetVolume(v)
	p.mu.Unlock()
}

// Volume returns gain in [0, 1].
func (p *Player) Volume() float64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.volume
}

// Close stops the stream and releases the file. It is safe to call twice.
func (p *Player) Close() error {
	if p == nil {
		return nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.stream != nil {
		p.stream.Stop()
		p.stream.Close()
		p.stream = nil
	}
	p.playing = false
	if p.file != nil {
		err := p.file.Close()
		p.file = nil
		return err
	}
	return nil
}
