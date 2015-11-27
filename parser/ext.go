package parser

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

// GetExt returns the lowercase file name extension used by path.
func GetExt(path string) string {
	return strings.ToLower(filepath.Ext(path))
}

// IsExt returns true if path without ext
func IsExt(path string) bool {
	return GetExt(path) != ""
}
