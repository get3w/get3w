package ioutils

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"

	"github.com/get3w/get3w/pkg/stringutils"
)

// Pack tar and gzip files
func Pack(gzPath, dirPath string, pathMap map[string]int) error {
	fw, err := os.Create(gzPath)
	if err != nil {
		return err
	}
	defer fw.Close()

	gw := gzip.NewWriter(fw)
	defer gw.Close()

	tw := tar.NewWriter(gw)
	defer tw.Close()

	for path, val := range pathMap {
		if val < 0 {
			continue
		}
		f, err := os.Stat(filepath.Join(dirPath, path))
		if err != nil {
			continue
		}
		if f.IsDir() {
			continue
		}

		fr, err := os.Open(filepath.Join(dirPath, path))
		if err != nil {
			return err
		}
		defer fr.Close()

		h := new(tar.Header)
		h.Name = path
		h.Size = f.Size()
		h.Mode = int64(f.Mode())
		h.ModTime = f.ModTime()

		err = tw.WriteHeader(h)
		if err != nil {
			return err
		}

		_, err = io.Copy(tw, fr)
		if err != nil {
			return err
		}
	}

	return nil
}

// UnPack get tar.gz bytes and returns path width bytes map
func UnPack(bs []byte) (map[string][]byte, error) {
	pathBytesMap := make(map[string][]byte)
	br := bytes.NewReader(bs)

	gr, err := gzip.NewReader(br)
	if err != nil {
		return nil, err
	}
	defer gr.Close()

	tr := tar.NewReader(gr)

	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		path := h.Name
		bs := stringutils.ReaderToBytes(tr)
		pathBytesMap[path] = bs
	}

	return pathBytesMap, nil
}
