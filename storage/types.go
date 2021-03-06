package storage

import (
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
	KeyPages  = "_pages.md"
	KeySites  = "_sites.md"
	KeyReadme = "README.md"

	PrefixLogs     = "_logs"
	PrefixPosts    = "_posts"
	PrefixIncludes = "_includes"
	PrefixLayouts  = "_layouts"
	PrefixSections = "_sections"
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
	Owner   string
	Name    string
	Path    string
	Storage Storage
	Config  *get3w.Config
	Sites   []*get3w.Site

	Default *get3w.Site
	Current *get3w.Site

	cacheFiles map[string][]byte
	logger     *log.Logger
}

// NewLocalParser return local site
func NewLocalParser(owner, contextDir string) (*Parser, error) {
	s, err := local.New(contextDir)
	if err != nil {
		return nil, err
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

	cacheFiles := make(map[string][]byte)

	logger := log.New()
	logger.Formatter = new(log.TextFormatter)
	logger.Level = log.WarnLevel
	logger.Hooks.Add(lfshook.NewHook(lfshook.PathMap{
		log.WarnLevel:  warnPath,
		log.ErrorLevel: errorPath,
	}))

	parser := &Parser{
		Owner:      owner,
		Name:       s.Name,
		Path:       s.RootPath,
		Config:     config,
		Sites:      sites,
		Default:    defaultSite,
		Current:    defaultSite,
		cacheFiles: cacheFiles,
		logger:     logger,
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
	cacheFiles := make(map[string][]byte)

	parser := &Parser{
		Owner:      owner,
		Name:       name,
		Path:       owner + "/" + name,
		Config:     config,
		Sites:      sites,
		Default:    defaultSite,
		Current:    defaultSite,
		cacheFiles: cacheFiles,
	}
	parser.Storage = s

	return parser, nil
}
