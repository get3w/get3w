package storage

import (
	"fmt"
	"path/filepath"

	log "github.com/Sirupsen/logrus"
	"github.com/rifflock/lfshook"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/storage/local"
	"github.com/get3w/get3w/storage/s3"
)

// system const
const (
	KeyConfig = "_config.yml"
	KeyLinks  = "_links.md"
	KeySites  = "_sites.md"
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

// Parser contains attributes and operations of the app
type Parser struct {
	Name    string
	Path    string
	Storage Storage
	Config  *get3w.Config
	Sites   []*get3w.Site

	Default *get3w.Site
	Current *get3w.Site

	logger *log.Logger
}

// NewLocalParser return local site
func NewLocalParser(contextDir string) (*Parser, error) {
	s, err := local.New(contextDir)
	if err != nil {
		return nil, err
	}

	path := s.GetRootKey(KeyConfig)
	if !s.IsExist(path) {
		return nil, fmt.Errorf("Not a Site Repository: %s", s.GetRootPrefix(""))
	}

	config, sites, defaultSite := loadConfigAndSites(s)
	s.SourcePath = filepath.Join(s.RootPath, config.Source)
	s.DestinationPath = filepath.Join(s.RootPath, config.Destination)

	warnPath := s.GetSourceKey(PrefixLogs, "warn.log")
	errorPath := s.GetSourceKey(PrefixLogs, "error.log")
	if !s.IsExist(warnPath) {
		s.Write(warnPath, []byte{})
	}
	if !s.IsExist(errorPath) {
		s.Write(errorPath, []byte{})
	}

	logger := log.New()
	logger.Formatter = new(log.TextFormatter)
	logger.Level = log.WarnLevel
	logger.Hooks.Add(lfshook.NewHook(lfshook.PathMap{
		log.WarnLevel:  warnPath,
		log.ErrorLevel: errorPath,
	}))

	parser := &Parser{
		Name:    s.Name,
		Path:    s.RootPath,
		Config:  config,
		Sites:   sites,
		Default: defaultSite,
		Current: defaultSite,
		logger:  logger,
	}
	parser.Storage = s

	return parser, nil
}

// NewS3Parser returns a new s3 site
func NewS3Parser(bucketSource, bucketDestination, owner, name string) (*Parser, error) {
	s, err := s3.New(bucketSource, bucketDestination, owner, name)
	if err != nil {
		return nil, err
	}

	config, sites, defaultSite := loadConfigAndSites(s)

	parser := &Parser{
		Name:    name,
		Path:    owner + "/" + name,
		Config:  config,
		Sites:   sites,
		Default: defaultSite,
		Current: defaultSite,
	}
	parser.Storage = s

	return parser, nil
}
