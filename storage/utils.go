package storage

import (
	"path/filepath"
	"strings"

	"github.com/russross/blackfriday"
)

// system file or folder names
const (
	ExtHTML = ".html"
	ExtMD   = ".md"
	ExtCSS  = ".css"
	ExtJS   = ".js"
	ExtPNG  = ".png"
)

// getExt returns the lowercase file name extension used by path.
func getExt(path string) string {
	return strings.ToLower(filepath.Ext(path))
}

// isExt returns true if path without ext
func isExt(path string) bool {
	return getExt(path) != ""
}

// removeExt get rid of ext
func removeExt(path string) string {
	return strings.TrimSuffix(path, filepath.Ext(path))
}

func getStringByExt(ext string, val []byte) string {
	if ext == ExtMD {
		return string(blackfriday.MarkdownCommon(val))
	}
	return string(val)
}
