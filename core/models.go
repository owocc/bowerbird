package core

// LibraryInfo represents metadata about an opened library.
type LibraryInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
	ItemCount int64  `json:"itemCount"`
}

// Folder represents a virtual organizational directory in the library.
type Folder struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	ParentID  string   `json:"parentId"`
	CreatedAt int64    `json:"createdAt"`
	SortOrder int      `json:"sortOrder"`
	Children  []Folder `json:"children,omitempty"`
	ItemCount int      `json:"itemCount"`
}

// Tag represents a tag taxonomy entry with its item count.
type Tag struct {
	Name      string `json:"name"`
	CreatedAt int64  `json:"createdAt"`
	ItemCount int    `json:"itemCount"`
}

// ImageMeta holds extended metadata extracted from an image or media file.
type ImageMeta struct {
	ColorModel  string `json:"colorModel,omitempty"`
	ColorSpace  string `json:"colorSpace,omitempty"`
	HasAlpha    bool   `json:"hasAlpha,omitempty"`
	AspectRatio string `json:"aspectRatio,omitempty"`
	Orientation string `json:"orientation,omitempty"` // "landscape" | "portrait" | "square"
	BitDepth    int    `json:"bitDepth,omitempty"`
	Animated    bool   `json:"animated,omitempty"`
	ExifMake    string `json:"exifMake,omitempty"`
	ExifModel   string `json:"exifModel,omitempty"`
	ExifDate    string `json:"exifDate,omitempty"`
	Megapixels  string `json:"megapixels,omitempty"`
}

// Item represents a single managed asset in the library.
type Item struct {
	ID            string     `json:"id"`
	Hex           string     `json:"hex"`          // uppercase content hash (SHA-256)
	Name          string     `json:"name"`
	Extension     string     `json:"extension"`
	Filename      string     `json:"filename"`
	Size          int64      `json:"size"`
	MimeType      string     `json:"mimeType"`
	Width         int        `json:"width"`
	Height        int        `json:"height"`
	HasThumbnail  bool       `json:"hasThumbnail"`
	DominantColor string     `json:"dominantColor"`
	Palette       []string   `json:"palette"`
	Meta          *ImageMeta `json:"meta,omitempty"`
	Note          string     `json:"note"`
	URL           string     `json:"url"`
	Rating        int        `json:"rating"`
	Prompt        string     `json:"prompt"`
	Tags          []string   `json:"tags"`
	Folders       []string   `json:"folders"`
	InTrash       bool       `json:"inTrash"`
	TrashedAt     int64      `json:"trashedAt"`
	CreatedAt     int64      `json:"createdAt"`
	ImportedAt    int64      `json:"importedAt"`
	UpdatedAt     int64      `json:"updatedAt"`
	ItemPath      string     `json:"itemPath"`     // local disk path of item directory (items/<HEX>)
	FilePath      string     `json:"filePath"`     // absolute local path to physical file
	ShellPath     string     `json:"shellPath"`    // shell-escaped path with backslash spaces
	FileURL       string     `json:"fileUrl"`      // file:// URI with spaces %20-encoded
	OriginalURL   string     `json:"originalUrl"`  // HTTP stream URL
	ThumbnailURL  string     `json:"thumbnailUrl"` // HTTP thumbnail URL
	DownloadURL   string     `json:"downloadUrl"`  // HTTP download URL for OS drag-out
}

// ItemMetadata is serialized inside <item_hex>/metadata.json.
type ItemMetadata struct {
	ID             string     `json:"id"`
	Hex            string     `json:"hex"`
	Name           string     `json:"name"`
	Extension      string     `json:"extension"`
	Filename       string     `json:"filename"`
	Size           int64      `json:"size"`
	MimeType       string     `json:"mimeType"`
	Width          int        `json:"width"`
	Height         int        `json:"height"`
	HasThumbnail   bool       `json:"hasThumbnail"`
	DominantColor  string     `json:"dominantColor,omitempty"`
	Palette        []string   `json:"palette,omitempty"`
	Meta           *ImageMeta `json:"meta,omitempty"`
	Note           string     `json:"note,omitempty"`
	URL            string     `json:"url,omitempty"`
	Rating         int        `json:"rating,omitempty"`
	Prompt         string     `json:"prompt,omitempty"`
	Tags           []string   `json:"tags"`
	Folders        []string   `json:"folders"`
	InTrash        bool       `json:"inTrash,omitempty"`
	TrashedAt      int64      `json:"trashedAt,omitempty"`
	TrashedFolders []string   `json:"trashedFolders,omitempty"`
	CreatedAt      int64      `json:"createdAt"`
	ImportedAt     int64      `json:"importedAt"`
	UpdatedAt      int64      `json:"updatedAt,omitempty"`
}

// ImportItemOptions specifies metadata when importing items via API or browser extension.
type ImportItemOptions struct {
	Name      string            `json:"name,omitempty"`
	URL       string            `json:"url,omitempty"`
	Note      string            `json:"note,omitempty"`
	Rating    int               `json:"rating,omitempty"`
	Prompt    string            `json:"prompt,omitempty"`
	Tags      []string          `json:"tags,omitempty"`
	FolderIDs []string          `json:"folderIds,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
}
