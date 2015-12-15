package storage

import (
	log "github.com/Sirupsen/logrus"

	"github.com/get3w/get3w-sdk-go/get3w"
)

// system const
const (
	KeyGet3W  = "_get3w.md"
	KeyConfig = "_config.yml"
	KeyPages  = "_pages.md"
	KeyLangs  = "_langs.md"
	KeyReadme = "README.md"

	PrefixLogs     = "_logs"
	PrefixPosts    = "_posts"
	PrefixIncludes = "_includes"
	PrefixLayouts  = "_layouts"
	PrefixSections = "_sections"

	TemplateEngineLiquid = "liquid"
)

// Storage contains methods of storage operations
type Storage interface {
	GetRootPrefix(prefix ...string) string
	GetRootKey(url ...string) string
	GetSourcePrefix(prefix ...string) string
	GetSourceKey(url ...string) string
	GetDestinationPrefix(prefix ...string) string
	GetDestinationKey(url ...string) string
	Read(key string) ([]byte, error)
	Checksum(key string) (string, error)
	Write(key string, bs []byte) error
	WriteDestination(key string, bs []byte) error
	Download(key, downloadURL string) error
	Rename(owner, newName string, deleteAll bool) error
	CopyToDestination(sourceKey, destinationKey string) error
	Delete(key string) error
	DeleteDestination(key string) error
	GetFiles(prefix string) ([]*get3w.File, error)
	GetAllFiles(prefix string) ([]*get3w.File, error)
	IsExist(key string) bool
	DeleteFolder(prefix string) error
	NewFolder(prefix string) error
}

// Site contains attributes and operations of the app
type Site struct {
	Name    string
	Path    string
	Storage Storage
	Config  *get3w.Config
	Links   []*get3w.Link
	Current *get3w.Lang
	Langs   []*get3w.Lang

	sections map[string]*get3w.Section

	channels []*get3w.Channel
	logger   *log.Logger
}
