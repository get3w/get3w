package storage

import (
	log "github.com/Sirupsen/logrus"

	"github.com/get3w/get3w-sdk-go/get3w"
)

// Site contains attributes and operations of the app
type Site struct {
	Name                 string
	Path                 string
	GetSourcePrefix      func(prefix ...string) string
	GetDestinationPrefix func(prefix ...string) string
	GetSourceKey         func(url ...string) string
	GetDestinationKey    func(url ...string) string
	Read                 func(key string) ([]byte, error)
	Checksum             func(key string) (string, error)
	Write                func(key string, bs []byte) error
	WriteDestination     func(key string, bs []byte) error
	Download             func(key, downloadURL string) error
	Rename               func(owner, newName string, deleteAll bool) error
	CopyToDestination    func(sourceKey, destinationKey string) error
	Delete               func(key string) error
	DeleteDestination    func(key string) error
	GetFiles             func(prefix string) ([]*get3w.File, error)
	GetAllFiles          func(prefix string) ([]*get3w.File, error)
	IsExist              func(key string) bool
	DeleteFolder         func(prefix string) error
	NewFolder            func(prefix string) error

	Config    *get3w.Config
	Summaries []*get3w.PageSummary

	pages    []*get3w.Page
	posts    map[string][]*get3w.Post
	sections map[string]*get3w.Section
	logger   *log.Logger
}
