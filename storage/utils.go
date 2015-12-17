package storage

import (
	"path"
	"path/filepath"
	"strings"

	log "github.com/Sirupsen/logrus"
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

func (parser *Parser) prefix(prefix ...string) string {
	return parser.Storage.GetSourcePrefix(parser.Current.Path, path.Join(prefix...))
}

func (parser *Parser) key(key ...string) string {
	return parser.Storage.GetSourceKey(parser.Current.Path, path.Join(key...))
}

func (parser *Parser) destinationPrefix(prefix ...string) string {
	return parser.Storage.GetDestinationPrefix(parser.Current.Path, path.Join(prefix...))
}

func (parser *Parser) destinationKey(key ...string) string {
	return parser.Storage.GetDestinationKey(parser.Current.Path, path.Join(key...))
}

// LogWarn write content to log file
func (parser *Parser) LogWarn(templateURL, pageURL, warning string) {
	if parser.logger != nil {
		parser.logger.WithFields(log.Fields{
			"templateURL": templateURL,
			"pageURL":     pageURL,
		}).Warn(warning)
	}
}

// LogError write content to log file
func (parser *Parser) LogError(templateURL, pageURL string, err error) {
	if parser.logger != nil {
		parser.logger.WithFields(log.Fields{
			"templateURL": templateURL,
			"pageURL":     pageURL,
		}).Error(err.Error())
	}
}
