package core

import (
	"fmt"
)

// This file contains a small, dependency-free QR code encoder. It is a Go
// port of Kazuhiko Arase's QRCode generator (MIT licensed), which the former
// web UI used through qrcode-terminal. Byte mode is enough for the pairing
// URLs shown by the desktop, so the numeric/alphanumeric/kanji modes are
// intentionally omitted.

// qrECLevel is the QR error-correction level. The order matches the RS block
// table below (L, M, Q, H).
type qrECLevel int

const (
	qrECLow qrECLevel = iota
	qrECMedium
	qrECQuartile
	qrECHigh
)

// formatBits maps a level to the two bits written in the format information.
func (l qrECLevel) formatBits() int {
	switch l {
	case qrECLow:
		return 1
	case qrECMedium:
		return 0
	case qrECQuartile:
		return 3
	default:
		return 2
	}
}

const (
	qrModeByte = 1 << 2

	qrPad0 = 0xEC
	qrPad1 = 0x11

	qrG15     = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | 1
	qrG18     = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | 1
	qrG15Mask = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1)
)

type qrRSBlock struct {
	totalCount int
	dataCount  int
}

type qrBitBuffer struct {
	bytes  []byte
	length int
}

func (b *qrBitBuffer) putBit(bit bool) {
	index := b.length / 8
	if index >= len(b.bytes) {
		b.bytes = append(b.bytes, 0)
	}
	if bit {
		b.bytes[index] |= 0x80 >> uint(b.length%8)
	}
	b.length++
}

func (b *qrBitBuffer) put(num, length int) {
	for i := 0; i < length; i++ {
		b.putBit(((num >> uint(length-i-1)) & 1) == 1)
	}
}

type qrCode struct {
	typeNumber int
	level      qrECLevel
	modules    [][]bool
	function   [][]bool
	data       []byte
}

// QRCodeMatrix returns the dark/light module matrix for data using medium
// error correction. It is what the desktop settings UI turns into a bitmap for
// the mobile pairing QR code.
func QRCodeMatrix(data string) ([][]bool, error) {
	return encodeQRCode([]byte(data), qrECMedium)
}

// encodeQRCode returns the dark/light module matrix for data. It picks the
// smallest version that fits and the mask with the lowest penalty.
func encodeQRCode(data []byte, level qrECLevel) ([][]bool, error) {
	q := &qrCode{typeNumber: 0, level: level}
	if err := q.make(data); err != nil {
		return nil, err
	}
	return q.modules, nil
}

func (q *qrCode) make(data []byte) error {
	if q.typeNumber < 1 {
		found := false
		for version := 1; version <= 40; version++ {
			blocks, err := qrGetRSBlocks(version, q.level)
			if err != nil {
				return err
			}
			totalDataCount := 0
			for _, block := range blocks {
				totalDataCount += block.dataCount
			}
			var buffer qrBitBuffer
			buffer.put(qrModeByte, 4)
			buffer.put(len(data), qrLengthInBits(version))
			for _, value := range data {
				buffer.put(int(value), 8)
			}
			if buffer.length <= totalDataCount*8 {
				q.typeNumber = version
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("qr: data too long (%d bytes)", len(data))
		}
	}

	q.data = q.createData(data)
	bestMask, bestLost := 0, 0
	for mask := 0; mask < 8; mask++ {
		q.makeImpl(true, mask)
		lost := q.lostPoint()
		if mask == 0 || lost < bestLost {
			bestMask, bestLost = mask, lost
		}
	}
	q.makeImpl(false, bestMask)
	return nil
}

func (q *qrCode) makeImpl(test bool, maskPattern int) {
	q.modules = make([][]bool, q.typeNumber*4+17)
	q.function = make([][]bool, len(q.modules))
	for row := range q.modules {
		q.modules[row] = make([]bool, len(q.modules))
		q.function[row] = make([]bool, len(q.modules))
	}

	q.setupPositionProbePattern(0, 0)
	q.setupPositionProbePattern(len(q.modules)-7, 0)
	q.setupPositionProbePattern(0, len(q.modules)-7)
	q.setupPositionAdjustPattern()
	q.setupTimingPattern()
	q.setupTypeInfo(test, maskPattern)
	if q.typeNumber >= 7 {
		q.setupTypeNumber(test)
	}
	q.mapData(q.data, maskPattern)
}

func (q *qrCode) isDark(row, col int) bool {
	if row < 0 || row >= len(q.modules) || col < 0 || col >= len(q.modules) {
		return false
	}
	return q.modules[row][col]
}

func (q *qrCode) setFunction(row, col int, dark bool) {
	if row < 0 || row >= len(q.modules) || col < 0 || col >= len(q.modules) {
		return
	}
	q.modules[row][col] = dark
	q.function[row][col] = true
}

func (q *qrCode) setupPositionProbePattern(row, col int) {
	for r := -1; r <= 7; r++ {
		if row+r <= -1 || row+r >= len(q.modules) {
			continue
		}
		for c := -1; c <= 7; c++ {
			if col+c <= -1 || col+c >= len(q.modules) {
				continue
			}
			dark := (0 <= r && r <= 6 && (c == 0 || c == 6)) ||
				(0 <= c && c <= 6 && (r == 0 || r == 6)) ||
				(2 <= r && r <= 4 && 2 <= c && c <= 4)
			q.setFunction(row+r, col+c, dark)
		}
	}
}

func (q *qrCode) setupTimingPattern() {
	for r := 8; r < len(q.modules)-8; r++ {
		if q.function[r][6] {
			continue
		}
		q.setFunction(r, 6, r%2 == 0)
	}
	for c := 8; c < len(q.modules)-8; c++ {
		if q.function[6][c] {
			continue
		}
		q.setFunction(6, c, c%2 == 0)
	}
}

func (q *qrCode) setupPositionAdjustPattern() {
	pos := qrPatternPositionTable[q.typeNumber-1]
	for _, row := range pos {
		for _, col := range pos {
			if q.function[row][col] {
				continue
			}
			for r := -2; r <= 2; r++ {
				for c := -2; c <= 2; c++ {
					dark := r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)
					q.setFunction(row+r, col+c, dark)
				}
			}
		}
	}
}

func (q *qrCode) setupTypeNumber(test bool) {
	bits := qrBCHTypeNumber(q.typeNumber)
	for i := 0; i < 18; i++ {
		dark := !test && ((bits>>uint(i))&1) == 1
		q.setFunction(i/3, i%3+len(q.modules)-8-3, dark)
	}
	for i := 0; i < 18; i++ {
		dark := !test && ((bits>>uint(i))&1) == 1
		q.setFunction(i%3+len(q.modules)-8-3, i/3, dark)
	}
}

func (q *qrCode) setupTypeInfo(test bool, maskPattern int) {
	data := (q.level.formatBits() << 3) | maskPattern
	bits := qrBCHTypeInfo(data)

	for v := 0; v < 15; v++ {
		dark := !test && ((bits>>uint(v))&1) == 1
		switch {
		case v < 6:
			q.setFunction(v, 8, dark)
		case v < 8:
			q.setFunction(v+1, 8, dark)
		default:
			q.setFunction(len(q.modules)-15+v, 8, dark)
		}
	}
	for h := 0; h < 15; h++ {
		dark := !test && ((bits>>uint(h))&1) == 1
		switch {
		case h < 8:
			q.setFunction(8, len(q.modules)-h-1, dark)
		case h < 9:
			q.setFunction(8, 15-h-1+1, dark)
		default:
			q.setFunction(8, 15-h-1, dark)
		}
	}
	q.setFunction(len(q.modules)-8, 8, !test)
}

func (q *qrCode) mapData(data []byte, maskPattern int) {
	inc := -1
	row := len(q.modules) - 1
	bitIndex := 7
	byteIndex := 0

	for col := len(q.modules) - 1; col > 0; col -= 2 {
		if col == 6 {
			col--
		}
		for {
			for c := 0; c < 2; c++ {
				if !q.function[row][col-c] {
					dark := false
					if byteIndex < len(data) {
						dark = ((data[byteIndex] >> uint(bitIndex)) & 1) == 1
					}
					if qrMask(maskPattern, row, col-c) {
						dark = !dark
					}
					q.modules[row][col-c] = dark
					bitIndex--
					if bitIndex == -1 {
						byteIndex++
						bitIndex = 7
					}
				}
			}
			row += inc
			if row < 0 || row >= len(q.modules) {
				row -= inc
				inc = -inc
				break
			}
		}
	}
}

func (q *qrCode) createData(data []byte) []byte {
	blocks, _ := qrGetRSBlocks(q.typeNumber, q.level)
	var buffer qrBitBuffer
	buffer.put(qrModeByte, 4)
	buffer.put(len(data), qrLengthInBits(q.typeNumber))
	for _, value := range data {
		buffer.put(int(value), 8)
	}

	totalDataCount := 0
	for _, block := range blocks {
		totalDataCount += block.dataCount
	}
	if buffer.length > totalDataCount*8 {
		return nil
	}
	if buffer.length+4 <= totalDataCount*8 {
		buffer.put(0, 4)
	}
	for buffer.length%8 != 0 {
		buffer.putBit(false)
	}
	for {
		if buffer.length >= totalDataCount*8 {
			break
		}
		buffer.put(qrPad0, 8)
		if buffer.length >= totalDataCount*8 {
			break
		}
		buffer.put(qrPad1, 8)
	}

	offset := 0
	maxDcCount, maxEcCount := 0, 0
	dcData := make([][]int, len(blocks))
	ecData := make([][]int, len(blocks))
	for i, block := range blocks {
		dcCount := block.dataCount
		ecCount := block.totalCount - dcCount
		if dcCount > maxDcCount {
			maxDcCount = dcCount
		}
		if ecCount > maxEcCount {
			maxEcCount = ecCount
		}
		dcData[i] = make([]int, dcCount)
		for x := 0; x < dcCount; x++ {
			dcData[i][x] = int(buffer.bytes[x+offset])
		}
		offset += dcCount

		rsPoly := qrErrorCorrectPolynomial(ecCount)
		rawPoly := qrPoly(dcData[i]).shift(rsPoly.length() - 1)
		modPoly := rawPoly.mod(rsPoly)
		ecData[i] = make([]int, rsPoly.length()-1)
		for x := range ecData[i] {
			index := x + modPoly.length() - len(ecData[i])
			if index >= 0 {
				ecData[i][x] = modPoly[index]
			}
		}
	}

	totalCodeCount := 0
	for _, block := range blocks {
		totalCodeCount += block.totalCount
	}
	out := make([]byte, totalCodeCount)
	index := 0
	for z := 0; z < maxDcCount; z++ {
		for i := range blocks {
			if z < len(dcData[i]) {
				out[index] = byte(dcData[i][z])
				index++
			}
		}
	}
	for x := 0; x < maxEcCount; x++ {
		for i := range blocks {
			if x < len(ecData[i]) {
				out[index] = byte(ecData[i][x])
				index++
			}
		}
	}
	return out
}

func (q *qrCode) lostPoint() int {
	n := len(q.modules)
	lost := 0

	for row := 0; row < n; row++ {
		for col := 0; col < n; col++ {
			sameCount := 0
			dark := q.isDark(row, col)
			for r := -1; r <= 1; r++ {
				if row+r < 0 || row+r >= n {
					continue
				}
				for c := -1; c <= 1; c++ {
					if col+c < 0 || col+c >= n || (r == 0 && c == 0) {
						continue
					}
					if dark == q.isDark(row+r, col+c) {
						sameCount++
					}
				}
			}
			if sameCount > 5 {
				lost += 3 + sameCount - 5
			}
		}
	}

	for row := 0; row < n-1; row++ {
		for col := 0; col < n-1; col++ {
			count := 0
			for _, p := range [][2]int{{row, col}, {row + 1, col}, {row, col + 1}, {row + 1, col + 1}} {
				if q.isDark(p[0], p[1]) {
					count++
				}
			}
			if count == 0 || count == 4 {
				lost += 3
			}
		}
	}

	for row := 0; row < n; row++ {
		for col := 0; col < n-6; col++ {
			if q.isDark(row, col) && !q.isDark(row, col+1) && q.isDark(row, col+2) &&
				q.isDark(row, col+3) && q.isDark(row, col+4) && !q.isDark(row, col+5) &&
				q.isDark(row, col+6) {
				lost += 40
			}
		}
	}
	for col := 0; col < n; col++ {
		for row := 0; row < n-6; row++ {
			if q.isDark(row, col) && !q.isDark(row+1, col) && q.isDark(row+2, col) &&
				q.isDark(row+3, col) && q.isDark(row+4, col) && !q.isDark(row+5, col) &&
				q.isDark(row+6, col) {
				lost += 40
			}
		}
	}

	darkCount := 0
	for row := 0; row < n; row++ {
		for col := 0; col < n; col++ {
			if q.isDark(row, col) {
				darkCount++
			}
		}
	}
	ratio := (100*darkCount/n/n - 50)
	if ratio < 0 {
		ratio = -ratio
	}
	lost += (ratio / 5) * 10
	return lost
}

func qrLengthInBits(version int) int {
	switch {
	case version < 10:
		return 8
	case version < 27:
		return 16
	default:
		return 16
	}
}

func qrBCHTypeInfo(data int) int {
	d := data << 10
	for qrBCHDigit(d)-qrBCHDigit(qrG15) >= 0 {
		d ^= qrG15 << uint(qrBCHDigit(d)-qrBCHDigit(qrG15))
	}
	return ((data << 10) | d) ^ qrG15Mask
}

func qrBCHTypeNumber(data int) int {
	d := data << 12
	for qrBCHDigit(d)-qrBCHDigit(qrG18) >= 0 {
		d ^= qrG18 << uint(qrBCHDigit(d)-qrBCHDigit(qrG18))
	}
	return (data << 12) | d
}

func qrBCHDigit(data int) int {
	digit := 0
	for data != 0 {
		digit++
		data >>= 1
	}
	return digit
}

func qrMask(maskPattern, i, j int) bool {
	switch maskPattern {
	case 0:
		return (i+j)%2 == 0
	case 1:
		return i%2 == 0
	case 2:
		return j%3 == 0
	case 3:
		return (i+j)%3 == 0
	case 4:
		return (i/2+j/3)%2 == 0
	case 5:
		return (i*j)%2+(i*j)%3 == 0
	case 6:
		return ((i*j)%2+(i*j)%3)%2 == 0
	case 7:
		return ((i*j)%3+(i+j)%2)%2 == 0
	}
	return false
}

func qrExp(n int) int {
	for n < 0 {
		n += 255
	}
	for n >= 256 {
		n -= 255
	}
	return qrExpTable[n]
}

func qrLog(n int) int {
	if n < 1 {
		panic("qr: log of non-positive value")
	}
	return qrLogTable[n]
}

var qrExpTable, qrLogTable = func() ([256]int, [256]int) {
	var exp, log [256]int
	for i := 0; i < 8; i++ {
		exp[i] = 1 << uint(i)
	}
	for i := 8; i < 256; i++ {
		exp[i] = exp[i-4] ^ exp[i-5] ^ exp[i-6] ^ exp[i-8]
	}
	for i := 0; i < 255; i++ {
		log[exp[i]] = i
	}
	return exp, log
}()

type qrPoly []int

func (p qrPoly) length() int { return len(p) }

func (p qrPoly) shift(shift int) qrPoly {
	offset := 0
	for offset < len(p) && p[offset] == 0 {
		offset++
	}
	out := make(qrPoly, len(p)-offset+shift)
	copy(out, p[offset:])
	return out
}

func (p qrPoly) multiply(e qrPoly) qrPoly {
	out := make(qrPoly, len(p)+len(e)-1)
	for i := range p {
		for j := range e {
			out[i+j] ^= qrExp(qrLog(p[i]) + qrLog(e[j]))
		}
	}
	return out
}

func (p qrPoly) mod(e qrPoly) qrPoly {
	if len(p)-len(e) < 0 {
		return p
	}
	ratio := qrLog(p[0]) - qrLog(e[0])
	num := make(qrPoly, len(p))
	copy(num, p)
	for x := range e {
		num[x] ^= qrExp(qrLog(e[x]) + ratio)
	}
	return qrPoly(num).shift(0).mod(e)
}

func qrErrorCorrectPolynomial(errorCorrectLength int) qrPoly {
	a := qrPoly{1}
	for i := 0; i < errorCorrectLength; i++ {
		a = a.multiply(qrPoly{1, qrExp(i)})
	}
	return a
}

func qrGetRSBlocks(typeNumber int, level qrECLevel) ([]qrRSBlock, error) {
	if typeNumber < 1 || typeNumber > 40 {
		return nil, fmt.Errorf("qr: invalid version %d", typeNumber)
	}
	table := qrRSBlockTable[typeNumber-1][level]
	var blocks []qrRSBlock
	for i := 0; i+2 < len(table); i += 3 {
		count, totalCount, dataCount := table[i], table[i+1], table[i+2]
		for j := 0; j < count; j++ {
			blocks = append(blocks, qrRSBlock{totalCount: totalCount, dataCount: dataCount})
		}
	}
	return blocks, nil
}

var qrRSBlockTable = [][4][]int{
	{
		{1, 26, 19},
		{1, 26, 16},
		{1, 26, 13},
		{1, 26, 9},
	},
	{
		{1, 44, 34},
		{1, 44, 28},
		{1, 44, 22},
		{1, 44, 16},
	},
	{
		{1, 70, 55},
		{1, 70, 44},
		{2, 35, 17},
		{2, 35, 13},
	},
	{
		{1, 100, 80},
		{2, 50, 32},
		{2, 50, 24},
		{4, 25, 9},
	},
	{
		{1, 134, 108},
		{2, 67, 43},
		{2, 33, 15, 2, 34, 16},
		{2, 33, 11, 2, 34, 12},
	},
	{
		{2, 86, 68},
		{4, 43, 27},
		{4, 43, 19},
		{4, 43, 15},
	},
	{
		{2, 98, 78},
		{4, 49, 31},
		{2, 32, 14, 4, 33, 15},
		{4, 39, 13, 1, 40, 14},
	},
	{
		{2, 121, 97},
		{2, 60, 38, 2, 61, 39},
		{4, 40, 18, 2, 41, 19},
		{4, 40, 14, 2, 41, 15},
	},
	{
		{2, 146, 116},
		{3, 58, 36, 2, 59, 37},
		{4, 36, 16, 4, 37, 17},
		{4, 36, 12, 4, 37, 13},
	},
	{
		{2, 86, 68, 2, 87, 69},
		{4, 69, 43, 1, 70, 44},
		{6, 43, 19, 2, 44, 20},
		{6, 43, 15, 2, 44, 16},
	},
	{
		{4, 101, 81},
		{1, 80, 50, 4, 81, 51},
		{4, 50, 22, 4, 51, 23},
		{3, 36, 12, 8, 37, 13},
	},
	{
		{2, 116, 92, 2, 117, 93},
		{6, 58, 36, 2, 59, 37},
		{4, 46, 20, 6, 47, 21},
		{7, 42, 14, 4, 43, 15},
	},
	{
		{4, 133, 107},
		{8, 59, 37, 1, 60, 38},
		{8, 44, 20, 4, 45, 21},
		{12, 33, 11, 4, 34, 12},
	},
	{
		{3, 145, 115, 1, 146, 116},
		{4, 64, 40, 5, 65, 41},
		{11, 36, 16, 5, 37, 17},
		{11, 36, 12, 5, 37, 13},
	},
	{
		{5, 109, 87, 1, 110, 88},
		{5, 65, 41, 5, 66, 42},
		{5, 54, 24, 7, 55, 25},
		{11, 36, 12},
	},
	{
		{5, 122, 98, 1, 123, 99},
		{7, 73, 45, 3, 74, 46},
		{15, 43, 19, 2, 44, 20},
		{3, 45, 15, 13, 46, 16},
	},
	{
		{1, 135, 107, 5, 136, 108},
		{10, 74, 46, 1, 75, 47},
		{1, 50, 22, 15, 51, 23},
		{2, 42, 14, 17, 43, 15},
	},
	{
		{5, 150, 120, 1, 151, 121},
		{9, 69, 43, 4, 70, 44},
		{17, 50, 22, 1, 51, 23},
		{2, 42, 14, 19, 43, 15},
	},
	{
		{3, 141, 113, 4, 142, 114},
		{3, 70, 44, 11, 71, 45},
		{17, 47, 21, 4, 48, 22},
		{9, 39, 13, 16, 40, 14},
	},
	{
		{3, 135, 107, 5, 136, 108},
		{3, 67, 41, 13, 68, 42},
		{15, 54, 24, 5, 55, 25},
		{15, 43, 15, 10, 44, 16},
	},
	{
		{4, 144, 116, 4, 145, 117},
		{17, 68, 42},
		{17, 50, 22, 6, 51, 23},
		{19, 46, 16, 6, 47, 17},
	},
	{
		{2, 139, 111, 7, 140, 112},
		{17, 74, 46},
		{7, 54, 24, 16, 55, 25},
		{34, 37, 13},
	},
	{
		{4, 151, 121, 5, 152, 122},
		{4, 75, 47, 14, 76, 48},
		{11, 54, 24, 14, 55, 25},
		{16, 45, 15, 14, 46, 16},
	},
	{
		{6, 147, 117, 4, 148, 118},
		{6, 73, 45, 14, 74, 46},
		{11, 54, 24, 16, 55, 25},
		{30, 46, 16, 2, 47, 17},
	},
	{
		{8, 132, 106, 4, 133, 107},
		{8, 75, 47, 13, 76, 48},
		{7, 54, 24, 22, 55, 25},
		{22, 45, 15, 13, 46, 16},
	},
	{
		{10, 142, 114, 2, 143, 115},
		{19, 74, 46, 4, 75, 47},
		{28, 50, 22, 6, 51, 23},
		{33, 46, 16, 4, 47, 17},
	},
	{
		{8, 152, 122, 4, 153, 123},
		{22, 73, 45, 3, 74, 46},
		{8, 53, 23, 26, 54, 24},
		{12, 45, 15, 28, 46, 16},
	},
	{
		{3, 147, 117, 10, 148, 118},
		{3, 73, 45, 23, 74, 46},
		{4, 54, 24, 31, 55, 25},
		{11, 45, 15, 31, 46, 16},
	},
	{
		{7, 146, 116, 7, 147, 117},
		{21, 73, 45, 7, 74, 46},
		{1, 53, 23, 37, 54, 24},
		{19, 45, 15, 26, 46, 16},
	},
	{
		{5, 145, 115, 10, 146, 116},
		{19, 75, 47, 10, 76, 48},
		{15, 54, 24, 25, 55, 25},
		{23, 45, 15, 25, 46, 16},
	},
	{
		{13, 145, 115, 3, 146, 116},
		{2, 74, 46, 29, 75, 47},
		{42, 54, 24, 1, 55, 25},
		{23, 45, 15, 28, 46, 16},
	},
	{
		{17, 145, 115},
		{10, 74, 46, 23, 75, 47},
		{10, 54, 24, 35, 55, 25},
		{19, 45, 15, 35, 46, 16},
	},
	{
		{17, 145, 115, 1, 146, 116},
		{14, 74, 46, 21, 75, 47},
		{29, 54, 24, 19, 55, 25},
		{11, 45, 15, 46, 46, 16},
	},
	{
		{13, 145, 115, 6, 146, 116},
		{14, 74, 46, 23, 75, 47},
		{44, 54, 24, 7, 55, 25},
		{59, 46, 16, 1, 47, 17},
	},
	{
		{12, 151, 121, 7, 152, 122},
		{12, 75, 47, 26, 76, 48},
		{39, 54, 24, 14, 55, 25},
		{22, 45, 15, 41, 46, 16},
	},
	{
		{6, 151, 121, 14, 152, 122},
		{6, 75, 47, 34, 76, 48},
		{46, 54, 24, 10, 55, 25},
		{2, 45, 15, 64, 46, 16},
	},
	{
		{17, 152, 122, 4, 153, 123},
		{29, 74, 46, 14, 75, 47},
		{49, 54, 24, 10, 55, 25},
		{24, 45, 15, 46, 46, 16},
	},
	{
		{4, 152, 122, 18, 153, 123},
		{13, 74, 46, 32, 75, 47},
		{48, 54, 24, 14, 55, 25},
		{42, 45, 15, 32, 46, 16},
	},
	{
		{20, 147, 117, 4, 148, 118},
		{40, 75, 47, 7, 76, 48},
		{43, 54, 24, 22, 55, 25},
		{10, 45, 15, 67, 46, 16},
	},
	{
		{19, 148, 118, 6, 149, 119},
		{18, 75, 47, 31, 76, 48},
		{34, 54, 24, 34, 55, 25},
		{20, 45, 15, 61, 46, 16},
	},
}

var qrPatternPositionTable = [][]int{
	{},
	{6, 18},
	{6, 22},
	{6, 26},
	{6, 30},
	{6, 34},
	{6, 22, 38},
	{6, 24, 42},
	{6, 26, 46},
	{6, 28, 50},
	{6, 30, 54},
	{6, 32, 58},
	{6, 34, 62},
	{6, 26, 46, 66},
	{6, 26, 48, 70},
	{6, 26, 50, 74},
	{6, 30, 54, 78},
	{6, 30, 56, 82},
	{6, 30, 58, 86},
	{6, 34, 62, 90},
	{6, 28, 50, 72, 94},
	{6, 26, 50, 74, 98},
	{6, 30, 54, 78, 102},
	{6, 28, 54, 80, 106},
	{6, 32, 58, 84, 110},
	{6, 30, 58, 86, 114},
	{6, 34, 62, 90, 118},
	{6, 26, 50, 74, 98, 122},
	{6, 30, 54, 78, 102, 126},
	{6, 26, 52, 78, 104, 130},
	{6, 30, 56, 82, 108, 134},
	{6, 34, 60, 86, 112, 138},
	{6, 30, 58, 86, 114, 142},
	{6, 34, 62, 90, 118, 146},
	{6, 30, 54, 78, 102, 126, 150},
	{6, 24, 50, 76, 102, 128, 154},
	{6, 28, 54, 80, 106, 132, 158},
	{6, 32, 58, 84, 110, 136, 162},
	{6, 26, 54, 82, 110, 138, 166},
	{6, 30, 58, 86, 114, 142, 170},
}
