package storage

import (
	"path/filepath"
	"strings"
)

const (
	// ExtYML page extension .yml
	ExtYML = ".yml"
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
