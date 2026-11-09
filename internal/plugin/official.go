package plugin

// OfficialManifests returns the native plugins maintained by the Bowerbird
// team. They are registered as built-ins so the app always has working
// markdown/audio/psd/prompt support, even when no plugins directory exists.
//
// The repository copies under plugins/ carry the same ids and richer metadata
// for development and marketplace packaging. During Scan those directories
// override these manifests.
func OfficialManifests() []Manifest {
	return []Manifest{
		{
			ID:           "official.markdown-preview",
			Name:         "Markdown Preview",
			Version:      "2.0.0",
			Kind:         "preview",
			Native:       "markdown",
			Priority:     50,
			Description:  "Native GitHub-flavored Markdown preview rendered with mygo/ui.",
			Author:       "Bowerbird Team",
			License:      "MIT",
			Extensions:   []string{"md", "markdown", "mdown", "mkd", "mdwn", "mdt"},
			MimePrefixes: []string{"text/markdown", "text/x-markdown"},
			Capabilities: []string{"preview"},
			Builtin:      true,
		},
		{
			ID:           "official.audio-player",
			Name:         "Audio Player",
			Version:      "2.0.0",
			Kind:         "preview",
			Native:       "audio",
			Priority:     60,
			Description:  "Native audio playback with spectrum, scrubber and metadata.",
			Author:       "Bowerbird Team",
			License:      "MIT",
			Extensions:   []string{"mp3", "wav", "ogg", "flac", "m4a", "aac", "webm"},
			MimePrefixes: []string{"audio/"},
			Capabilities: []string{"preview"},
			Builtin:      true,
		},
		{
			ID:           "builtin.video",
			Name:         "Video Player",
			Version:      "2.0.0",
			Kind:         "preview",
			Native:       "video",
			Priority:     90,
			Description:  "Native video playback rendered by mygo/ui with ffmpeg frame decoding and mygo audio output.",
			Author:       "Bowerbird Team",
			License:      "MIT",
			Extensions:   []string{"mp4", "mov", "qt", "webm", "mkv", "avi", "m4v", "flv", "f4v", "mts", "m2ts", "m3u8", "m3u", "mpd", "ogv", "ogm", "3gp", "3g2", "wmv", "asf", "mpg", "mpeg", "m2v", "vob", "rmvb", "rm"},
			MimePrefixes: []string{"video/", "application/vnd.apple.mpegurl", "application/x-mpegurl", "application/dash+xml"},
			Capabilities: []string{"preview"},
			Builtin:      true,
		},
		{
			ID:           "official.psd-preview",
			Name:         "PSD Preview",
			Version:      "2.0.0",
			Kind:         "preview",
			Native:       "psd",
			Priority:     95,
			Description:  "Native Photoshop composite preview with layer tree and document facts.",
			Author:       "Bowerbird Team",
			License:      "MIT",
			Extensions:   []string{"psd", "psb"},
			MimePrefixes: []string{"image/vnd.adobe.photoshop", "image/x-photoshop", "image/photoshop", "image/psd", "application/x-photoshop"},
			SupportsZoom: true,
			Capabilities: []string{"preview"},
			Builtin:      true,
		},
		{
			ID:           "official.prompt-metadata",
			Name:         "AI Prompt Metadata",
			Version:      "2.0.0",
			Kind:         "metadata",
			Native:       "prompt",
			Priority:     50,
			Description:  "AI generation prompt field in the native inspector with copy and full-text editing.",
			Author:       "Bowerbird Team",
			License:      "MIT",
			Capabilities: []string{"metadata"},
			Builtin:      true,
		},
	}
}
