package storage

import (
	"path/filepath"
	"strings"

	"github.com/russross/blackfriday"
)

const (
	// ExtHTML page extension .html
	ExtHTML = ".html"
	// ExtMD page extension .md
	ExtMD = ".md"
	// ExtCSS page extension .css
	ExtCSS = ".css"
	// ExtJS page extension .js
	ExtJS = ".js"
	// ExtPNG page extension .png
	ExtPNG = ".png"
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
