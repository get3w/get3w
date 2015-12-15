package storage

import (
	"path"
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

func isUnderscorePrefix(path string) bool {
	paths := strings.Split(path, "/")
	for _, p := range paths {
		if strings.HasPrefix(p, "_") {
			return true
		}
	}
	return false
}

func (site *Site) prefix(prefix ...string) string {
	return site.Storage.GetSourcePrefix(site.Current.Path, path.Join(prefix...))
}

func (site *Site) key(key ...string) string {
	return site.Storage.GetSourceKey(site.Current.Path, path.Join(key...))
}
