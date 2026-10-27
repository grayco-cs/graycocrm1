"""Minimal pure-Python QR Code encoder (byte mode, ISO/IEC 18004 model 2).
Written for GrayCo handouts. Follows the standard algorithm: versions 1-40,
ECC levels L/M/Q/H, Reed-Solomon over GF(256) poly 0x11D, all 8 masks with
penalty scoring. Output: module matrix and inline SVG."""

ECC_CODEWORDS_PER_BLOCK = {
 'L': [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 'M': [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
 'Q': [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 'H': [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
}
NUM_ERROR_CORRECTION_BLOCKS = {
 'L': [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
 'M': [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
 'Q': [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
 'H': [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
}
ECC_FORMAT_BITS = {'L': 1, 'M': 0, 'Q': 3, 'H': 2}


def num_raw_data_modules(ver):
    result = (16 * ver + 128) * ver + 64
    if ver >= 2:
        numalign = ver // 7 + 2
        result -= (25 * numalign - 10) * numalign - 55
        if ver >= 7:
            result -= 36
    return result


def num_data_codewords(ver, ecl):
    return num_raw_data_modules(ver) // 8 - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver]


def gf_mul(x, y):
    z = 0
    for i in range(7, -1, -1):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z & 0xFF


def rs_divisor(degree):
    result = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            result[j] = gf_mul(result[j], root)
            if j + 1 < degree:
                result[j] ^= result[j + 1]
        root = gf_mul(root, 0x02)
    return result


def rs_remainder(data, divisor):
    result = [0] * len(divisor)
    for b in data:
        factor = b ^ result.pop(0)
        result.append(0)
        for i, coef in enumerate(divisor):
            result[i] ^= gf_mul(coef, factor)
    return result


def alignment_positions(ver):
    if ver == 1:
        return []
    numalign = ver // 7 + 2
    step = (ver * 8 + numalign * 3 + 5) // (numalign * 4 - 4) * 2
    result = [6]
    pos = ver * 4 + 17 - 7
    tail = []
    for _ in range(numalign - 1):
        tail.insert(0, pos)
        pos -= step
    return result + tail


class QR:
    def __init__(self, text, ecl='M', minver=1):
        data = text.encode('utf-8')
        self.ecl = ecl
        for ver in range(minver, 41):
            cap_bits = num_data_codewords(ver, ecl) * 8
            ccbits = 8 if ver <= 9 else 16
            used = 4 + ccbits + len(data) * 8
            if used <= cap_bits:
                break
        else:
            raise ValueError('too long')
        self.ver = ver
        self.size = ver * 4 + 17
        bits = []
        def app(val, n):
            for i in range(n - 1, -1, -1):
                bits.append((val >> i) & 1)
        app(0b0100, 4)
        app(len(data), ccbits)
        for b in data:
            app(b, 8)
        app(0, min(4, cap_bits - len(bits)))
        app(0, (-len(bits)) % 8)
        pad = 0xEC
        while len(bits) < cap_bits:
            app(pad, 8)
            pad ^= 0xEC ^ 0x11
        codewords = [int(''.join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
        allcw = self._add_ecc_interleave(codewords)
        n = self.size
        self.mod = [[False] * n for _ in range(n)]
        self.isfn = [[False] * n for _ in range(n)]
        self._draw_function_patterns()
        self._draw_codewords(allcw)
        best, bestpen = None, None
        for m in range(8):
            self._apply_mask(m)
            self._draw_format_bits(m)
            pen = self._penalty()
            if bestpen is None or pen < bestpen:
                best, bestpen = m, pen
            self._apply_mask(m)
        self.mask = best
        self._apply_mask(best)
        self._draw_format_bits(best)

    def _add_ecc_interleave(self, data):
        ver, ecl = self.ver, self.ecl
        numblocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver]
        blockecclen = ECC_CODEWORDS_PER_BLOCK[ecl][ver]
        rawcodewords = num_raw_data_modules(ver) // 8
        numshortblocks = numblocks - rawcodewords % numblocks
        shortblocklen = rawcodewords // numblocks
        blocks = []
        div = rs_divisor(blockecclen)
        k = 0
        for i in range(numblocks):
            dat = data[k:k + shortblocklen - blockecclen + (0 if i < numshortblocks else 1)]
            k += len(dat)
            ecc = rs_remainder(dat, div)
            if i < numshortblocks:
                dat = dat + [None]
            blocks.append(dat + ecc)
        result = []
        for i in range(len(blocks[0])):
            for j, blk in enumerate(blocks):
                if i != shortblocklen - blockecclen or j >= numshortblocks:
                    result.append(blk[i])
        return result

    def _set(self, x, y, dark):
        self.mod[y][x] = dark
        self.isfn[y][x] = True

    def _draw_function_patterns(self):
        n = self.size
        for i in range(n):
            self._set(6, i, i % 2 == 0)
            self._set(i, 6, i % 2 == 0)
        for (cx, cy) in [(3, 3), (n - 4, 3), (3, n - 4)]:
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    xx, yy = cx + dx, cy + dy
                    if 0 <= xx < n and 0 <= yy < n:
                        d = max(abs(dx), abs(dy))
                        self._set(xx, yy, d not in (2, 4))
        ap = alignment_positions(self.ver)
        na = len(ap)
        for i in range(na):
            for j in range(na):
                if (i == 0 and j == 0) or (i == 0 and j == na - 1) or (i == na - 1 and j == 0):
                    continue
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self._set(ap[i] + dx, ap[j] + dy, max(abs(dx), abs(dy)) != 1)
        self._draw_format_bits(0)
        self._draw_version()

    def _draw_format_bits(self, mask):
        data = ECC_FORMAT_BITS[self.ecl] << 3 | mask
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        bits = (data << 10 | rem) ^ 0x5412
        g = lambda i: ((bits >> i) & 1) != 0
        n = self.size
        for i in range(0, 6):
            self._set(8, i, g(i))
        self._set(8, 7, g(6))
        self._set(8, 8, g(7))
        self._set(7, 8, g(8))
        for i in range(9, 15):
            self._set(14 - i, 8, g(i))
        for i in range(0, 8):
            self._set(n - 1 - i, 8, g(i))
        for i in range(8, 15):
            self._set(8, n - 15 + i, g(i))
        self._set(8, n - 8, True)

    def _draw_version(self):
        if self.ver < 7:
            return
        rem = self.ver
        for _ in range(12):
            rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
        bits = self.ver << 12 | rem
        n = self.size
        for i in range(18):
            bit = ((bits >> i) & 1) != 0
            a = n - 11 + i % 3
            b = i // 3
            self._set(a, b, bit)
            self._set(b, a, bit)

    def _draw_codewords(self, data):
        n = self.size
        i = 0
        bits = []
        for b in data:
            for k in range(7, -1, -1):
                bits.append((b >> k) & 1)
        right = n - 1
        while right >= 1:
            if right == 6:
                right = 5
            for vert in range(n):
                for j in range(2):
                    x = right - j
                    upward = ((right + 1) & 2) == 0
                    y = (n - 1 - vert) if upward else vert
                    if not self.isfn[y][x] and i < len(bits):
                        self.mod[y][x] = bits[i] == 1
                        i += 1
            right -= 2
        assert i == len(bits)

    def _apply_mask(self, m):
        f = [lambda x, y: (x + y) % 2 == 0,
             lambda x, y: y % 2 == 0,
             lambda x, y: x % 3 == 0,
             lambda x, y: (x + y) % 3 == 0,
             lambda x, y: (x // 3 + y // 2) % 2 == 0,
             lambda x, y: x * y % 2 + x * y % 3 == 0,
             lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
             lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0][m]
        n = self.size
        for y in range(n):
            for x in range(n):
                if not self.isfn[y][x] and f(x, y):
                    self.mod[y][x] = not self.mod[y][x]

    def _penalty(self):
        n = self.size
        m = self.mod
        res = 0
        def runs_penalty(line):
            r = 0
            # rule 1: runs of 5+
            run, col = 0, None
            for v in line:
                if v == col:
                    run += 1
                else:
                    if run >= 5:
                        r += 3 + (run - 5)
                    col, run = v, 1
            if run >= 5:
                r += 3 + (run - 5)
            # rule 3: finder-like patterns (1011101 with 4 light on either side)
            padded = [False] * 4 + list(line) + [False] * 4
            pat = [True, False, True, True, True, False, True]
            for i in range(len(padded) - 6):
                if padded[i:i + 7] == pat:
                    before = padded[max(0, i - 4):i]
                    after = padded[i + 7:i + 11]
                    if (len(before) == 4 and not any(before)) or (len(after) == 4 and not any(after)):
                        r += 40
            return r
        for y in range(n):
            res += runs_penalty(m[y])
        for x in range(n):
            res += runs_penalty([m[y][x] for y in range(n)])
        for y in range(n - 1):
            for x in range(n - 1):
                c = m[y][x]
                if c == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                    res += 3
        dark = sum(sum(1 for v in row if v) for row in m)
        total = n * n
        k = (abs(dark * 20 - total * 10) + total - 1) // total - 1
        res += k * 10
        return res

    def svg(self, size_css='100%', border=4, fg='#0F1D2F', bg='#FFFFFF', title=None):
        n = self.size
        dim = n + border * 2
        parts = []
        for y in range(n):
            for x in range(n):
                if self.mod[y][x]:
                    parts.append('M%d,%dh1v1h-1z' % (x + border, y + border))
        t = '<title>%s</title>' % title if title else ''
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%s" height="%s" '
                'shape-rendering="crispEdges" role="img">%s<rect width="100%%" height="100%%" fill="%s"/>'
                '<path d="%s" fill="%s"/></svg>') % (dim, dim, size_css, size_css, t, bg, ''.join(parts), fg)

    def png(self, path, scale=8, border=4):
        from PIL import Image
        n = self.size
        dim = (n + 2 * border) * scale
        im = Image.new('L', (dim, dim), 255)
        px = im.load()
        for y in range(n):
            for x in range(n):
                if self.mod[y][x]:
                    for dy in range(scale):
                        for dx in range(scale):
                            px[(x + border) * scale + dx, (y + border) * scale + dy] = 0
        im.save(path)


if __name__ == '__main__':
    import sys
    q = QR(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'M')
    q.png(sys.argv[3] if len(sys.argv) > 3 else 'out.png')
    print(q.ver, q.mask)
