# Bowerbird Mobile LAN API Specification (v1)

This document specifies the LAN communication protocol and HTTP REST API exposed by the Bowerbird desktop application for mobile companion apps (such as the Flutter mobile app).

---

## 1. Overview & Architecture

- **Protocol**: HTTP/1.1 with JSON payloads and raw binary media streams.
- **Transport**: Local Area Network (Wi-Fi / Ethernet).
- **Default Port**: `17878` (configurable in desktop settings; dynamically binds fallback if occupied).
- **Authentication**: Bearer Token exchanged via a 6-digit one-time pairing code displayed on the desktop.
- **Zero-Configuration Discovery**: Apple Bonjour / Multicast DNS (mDNS) service broadcasting.
- **CORS**: Enabled on all endpoints with open `Access-Control-Allow-Origin: *` to simplify web and mobile WebView interop.

---

## 2. Service Discovery (mDNS / Bonjour)

The desktop application continuously broadcasts its availability on the local subnet via mDNS:

- **Service Type**: `_bowerbird._tcp`
- **Domain**: `local.`
- **Default Port**: `17878`
- **Instance Name**: `Bowerbird` or `Bowerbird (<hostname>)`
- **TXT Record Attributes**:
  - `version`: Protocol version string, e.g. `1.0.0`
  - `pairingRequired`: Boolean flag string (`true` or `false`)

### Discovery Flow
1. The mobile client queries `_bowerbird._tcp.local.` using mDNS.
2. The client discovers the desktop IP address, port, and TXT records.
3. If mDNS is unavailable or blocked across AP isolation subnets, the mobile client falls back to manual entry of `<host>:<port>`.

---

## 3. Pairing & Deep Link Protocol (`bowerbird://`)

### 3.1 QR Code & Deep Link Specification
The desktop application presents a QR code containing a custom scheme URI:
```text
bowerbird://pair?data=<urlencoded-json>
```

The encoded JSON structure:
```json
{
  "v": 1,
  "name": "My Material Library",
  "ips": ["192.168.1.50", "10.0.0.12", "100.80.20.10"],
  "port": 17878,
  "code": "493644"
}
```

- `v`: Protocol schema version (currently `1`).
- `name`: Active library name or application title.
- `ips`: Candidate IPv4 addresses prioritized as LAN addresses (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`), Tailscale addresses (`100.64-127.x.x`), and other active interfaces.
- `port`: HTTP listener port (default `17878`).
- `code`: Current 6-digit one-time pairing code.

### 3.2 Connection & Probing Workflow
1. The mobile client scans the QR code or receives a deep link via Android Intent Filter (`bowerbird://`).
2. The client parses the JSON payload (or raw JSON fallback).
3. The client probes candidate IPs sequentially via `GET http://<ip>:<port>/api/v1/status` with a 3-second timeout.
4. The first responsive candidate IP is selected as the active `baseUrl`.
5. The client automatically sends `POST /api/v1/pair` with `{"code": "...", "deviceName": "..."}` to obtain a long-lived Bearer token stored securely in `flutter_secure_storage`.

---

## 4. Pairing & Authentication Workflow

```
Mobile App                                       Desktop App
    |                                                 |
    |---- 1. GET /api/v1/status (No Auth) ----------->|
    |<--- Returns { name, version, pairingRequired } -|
    |                                                 |
    | (If pairingRequired == true)                    |
    | User reads 6-digit code shown on Desktop        |
    |---- 2. POST /api/v1/pair { code, deviceName } ->|
    |<--- Returns 200 { status: success, token: ... } |
    |                                                 |
    | 3. Store token securely (flutter_secure_storage)|
    |                                                 |
    |---- 4. GET /api/v1/items (Bearer <token>) ----->|
    |<--- Returns 200 { total, items: [...] } --------|
```

### Authorization Header
All endpoints except `/api/v1/status` and `/api/v1/pair` require authorization:
```http
Authorization: Bearer <64-character-hex-token>
```
Alternatively, for media players or image requests where setting custom HTTP headers is restricted, the token can be passed as a query parameter:
```http
GET /api/v1/thumbs/{id}?token=<64-character-hex-token>
GET /api/v1/originals/{id}?token=<64-character-hex-token>
```

---

## 4. Endpoints

### 4.1 Server Status
- **Method**: `GET`
- **Path**: `/api/v1/status`
- **Auth**: None
- **Response**: `200 OK`
```json
{
  "name": "My Material Library",
  "version": "1.1.0",
  "itemCount": 1420,
  "pairingRequired": true
}
```

---

### 4.2 Device Pairing
- **Method**: `POST`
- **Path**: `/api/v1/pair`
- **Auth**: None
- **Request Body**:
```json
{
  "code": "849201",
  "deviceName": "Google Pixel 8"
}
```
- **Response**: `200 OK`
```json
{
  "status": "success",
  "code": "OK",
  "data": {
    "token": "4f9d2a1b7c8e...",
    "name": "Bowerbird"
  }
}
```
- **Errors**:
  - `401 Unauthorized` with code `INVALID_PAIRING_CODE`: The code is incorrect or expired.

---

### 4.3 Timeline Item List
- **Method**: `GET`
- **Path**: `/api/v1/items`
- **Auth**: Required (`Bearer <token>`)
- **Query Parameters**:
  | Parameter | Type | Default | Description |
  |---|---|---|---|
  | `limit` | integer | `50` | Maximum items to return (1 - 200). |
  | `offset` | integer | `0` | Pagination start index. |
  | `q` | string | `""` | Search keyword matching name, filename, tags, or prompt. |
  | `tag` | string | `""` | Tag filter (exact match, case-insensitive). |
  | `folder` | string | `""` | Folder ID filter (items belonging to folder). |
  | `color` | string | `""` | Hex color code (e.g. `#EF4444`). Matches items within redmean perceptual tolerance. |
  | `type` | string | `""` | File category filter: `image`, `video`, `audio`, `document`, or specific extension. |
  | `orientation` | string | `""` | Orientation filter: `landscape`, `portrait`, `square`. |
- **Response**: `200 OK`
```json
{
  "total": 1420,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "A1B2C3D4E5F60123456789ABCDEF...",
      "name": "Sunset over Mountains",
      "filename": "sunset.jpg",
      "extension": "jpg",
      "width": 3840,
      "height": 2160,
      "size": 4219500,
      "mimeType": "image/jpeg",
      "thumbnailUrl": "/api/v1/thumbs/A1B2C3D4E5F60123456789ABCDEF...",
      "originalUrl": "/api/v1/originals/A1B2C3D4E5F60123456789ABCDEF...",
      "createdAt": 1729000000000,
      "importedAt": 1729000100000,
      "date": 1729000000000,
      "orientation": "landscape",
      "tags": ["landscape", "sunset", "nature"],
      "folders": ["b041cf50-8b1d-4eb3-81e5-8f6a98765432"]
    }
  ]
}
```

---

### 4.4 Item Details
- **Method**: `GET`
- **Path**: `/api/v1/items/{id}`
- **Auth**: Required
- **Response**: `200 OK`
Returns the full `Item` entity containing metadata, dominant color, color palette, EXIF properties, folder hierarchies, and notes:
```json
{
  "id": "A1B2C3D4E5F60123456789ABCDEF...",
  "hex": "A1B2C3D4E5F60123456789ABCDEF...",
  "name": "Sunset over Mountains",
  "extension": "jpg",
  "filename": "sunset.jpg",
  "size": 4219500,
  "mimeType": "image/jpeg",
  "width": 3840,
  "height": 2160,
  "hasThumbnail": true,
  "dominantColor": "#c45c22",
  "palette": ["#c45c22", "#4a2d1f", "#f8d388"],
  "meta": {
    "aspectRatio": "1.78",
    "orientation": "landscape",
    "exifMake": "SONY",
    "exifModel": "ILCE-7M4",
    "exifDate": "2026:10:15 17:34:20",
    "megapixels": "8.3"
  },
  "note": "Shot during golden hour",
  "url": "https://unsplash.com/photos/...",
  "rating": 5,
  "prompt": "",
  "tags": ["landscape", "sunset", "nature"],
  "folders": ["b041cf50-8b1d-4eb3-81e5-8f6a98765432"],
  "inTrash": false,
  "createdAt": 1729000000000,
  "importedAt": 1729000100000,
  "updatedAt": 1729000200000,
  "thumbnailUrl": "/api/v1/thumbs/A1B2C3D4E5F60123456789ABCDEF...",
  "originalUrl": "/api/v1/originals/A1B2C3D4E5F60123456789ABCDEF..."
}
```


---

### 4.4.1 Delete Item (Move to Trash)
- **Method**: `DELETE`
- **Path**: `/api/v1/items/{id}`
- **Auth**: Required
- **Response**: `200 OK`
```json
{
  "status": "success",
  "code": "OK",
  "data": {
    "id": "A1B2C3D4E5F60123456789ABCDEF...",
    "inTrash": true
  }
}
```
Moves the item into the desktop recycle bin (same semantics as `MoveToTrash`). The item can be restored from the desktop trash view; there is no permanent-delete endpoint on the mobile API. On success the server broadcasts `items_updated` over the WebSocket.

Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`, `409 ERR_ITEM_ALREADY_TRASHED`, `503 ERR_NO_ACTIVE_LIBRARY`, `500 ERR_DELETE_ITEM_FAILED`.

---


### 4.5 Tags List
- **Method**: `GET`
- **Path**: `/api/v1/tags`
- **Auth**: Required
- **Response**: `200 OK`
```json
[
  {
    "name": "Favorites",
    "createdAt": 1729000000000,
    "itemCount": 42
  },
  {
    "name": "wallpaper",
    "createdAt": 1729000050000,
    "itemCount": 18
  }
]
```

---

### 4.6 Virtual Folders Hierarchy
- **Method**: `GET`
- **Path**: `/api/v1/folders`
- **Auth**: Required
- **Response**: `200 OK`
```json
[
  {
    "id": "b041cf50-8b1d-4eb3-81e5-8f6a98765432",
    "name": "Design Assets",
    "parentId": "",
    "sortOrder": 0,
    "itemCount": 12,
    "children": [
      {
        "id": "c152de61-9c2e-5fc4-92f6-9f7b09876543",
        "name": "Icons",
        "parentId": "b041cf50-8b1d-4eb3-81e5-8f6a98765432",
        "sortOrder": 0,
        "itemCount": 5
      }
    ]
  }
]
```

---

### 4.7 Aggregated Dominant Colors
- **Method**: `GET`
- **Path**: `/api/v1/colors`
- **Auth**: Required
- **Response**: `200 OK`
Returns top aggregated dominant hex colors from active library items for color filtering palettes:
```json
[
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#3B82F6",
  "#8B5CF6"
]
```
---

### 4.8 Thumbnail Image
- **Method**: `GET` / `HEAD`
- **Path**: `/api/v1/thumbs/{id}`
- **Auth**: Required
- **Response Headers**:
  - `Content-Type: image/jpeg`
  - `Cache-Control: public, max-age=31536000, immutable`
- **Behavior**:
  Serves cached `thumbnail.jpg` if generated. If the thumbnail does not exist yet (e.g. newly imported high-res image), it falls back to streaming the original media file with `Cache-Control: public, max-age=86400`.

---

### 4.9 Original Media Stream (with Range Seeking)
- **Method**: `GET` / `HEAD`
- **Path**: `/api/v1/originals/{id}`
- **Auth**: Required
- **Request Headers (Optional)**:
  - `Range: bytes=0-1048575`
- **Response Headers**:
  - `Accept-Ranges: bytes`
  - `Content-Range: bytes 0-1048575/4219500`
  - `Content-Type: <media-mime-type>`
  - `Content-Length: 1048576`
- **Status Codes**:
  - `200 OK` when full file is requested.
  - `206 Partial Content` when a byte range is requested (for audio/video scrubbing and chunked image downloads).

---

## 5. Error Representation & Status Codes

All errors return a standard JSON envelope:
```json
{
  "status": "error",
  "code": "ERROR_CODE_STRING",
  "message": "Human-readable description of error"
}
```

### Error Codes Table
| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid bearer token. |
| `ERR_ITEM_ALREADY_TRASHED` | 409 | The item is already in the recycle bin; repeated DELETE is rejected to preserve restore folders. |
| `INVALID_PAIRING_CODE` | 401 | The 6-digit pairing code does not match desktop code. |
| `ITEM_NOT_FOUND` / `NOT_FOUND` | 404 | The requested item ID does not exist in the active library. |
| `NO_ACTIVE_LIBRARY` | 503 | No library is currently opened in the desktop application. |
| `INVALID_ID` | 400 | Item ID parameter is empty or malformed. |
| `METHOD_NOT_ALLOWED` | 405 | The requested HTTP verb is not supported for this route. |
| `INTERNAL_ERROR` | 500 | Server encountered an unhandled error. |
