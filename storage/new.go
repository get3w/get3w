package storage

import (
	"path/filepath"
	"strings"

	log "github.com/Sirupsen/logrus"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/storage/local"
	"github.com/get3w/get3w/storage/s3"
	"github.com/rifflock/lfshook"
	"gopkg.in/yaml.v2"
)

func (site *Site) init() error {
	var configData, linksData, langsData []byte

	if site.Storage.IsExist(site.Storage.GetRootKey(KeyGet3W)) {
		data, _ := site.Storage.Read(site.Storage.GetRootKey(KeyGet3W))
		configData, linksData = fmatter.ReadRaw(data)
	}
	if len(configData) == 0 {
		if site.Storage.IsExist(site.Storage.GetRootKey(KeyConfig)) {
			configData, _ = site.Storage.Read(site.Storage.GetRootKey(KeyConfig))
		}
	}
	if len(linksData) == 0 {
		if site.Storage.IsExist(site.Storage.GetRootKey(KeyPages)) {
			linksData, _ = site.Storage.Read(site.Storage.GetRootKey(KeyPages))
		}
	}
	if site.Storage.IsExist(site.Storage.GetRootKey(KeyLangs)) {
		langsData, _ = site.Storage.Read(site.Storage.GetRootKey(KeyLangs))
	}

	site.Config = &get3w.Config{}
	if len(configData) > 0 {
		yaml.Unmarshal(configData, site.Config)
	}

	if site.Config.TemplateEngine == "" {
		site.Config.TemplateEngine = TemplateEngineLiquid
	}
	if site.Config.LayoutChannel == "" {
		site.Config.LayoutChannel = "default"
	}
	if site.Config.LayoutPost == "" {
		site.Config.LayoutPost = "post"
	}
	if site.Config.Destination == "" {
		site.Config.Destination = "_site"
	}

	site.Links = getLinks(string(linksData))
	site.Langs = getLangs(string(langsData))

	return nil
}

func (site *Site) load() {
	allParameters := make(map[string]interface{})
	configPath := site.key(KeyConfig)
	if site.Storage.IsExist(configPath) {
		configData, _ := site.Storage.Read(configPath)
		yaml.Unmarshal(configData, allParameters)
	}
	site.Current.AllParameters = allParameters

	linksPath := site.key(KeyPages)
	if site.Storage.IsExist(linksPath) {
		linksData, _ := site.Storage.Read(linksPath)
		site.Current.Links = getLinks(string(linksData))
	}

	site.Current.Posts = []*get3w.Post{}
	files, _ := site.Storage.GetAllFiles(site.prefix(PrefixPosts))
	for _, file := range files {
		if file.IsDir {
			continue
		}
		post := site.getPost(file)
		if post != nil {
			site.Current.Posts = append(site.Current.Posts, post)
		}
	}

	if len(site.Current.Links) == 0 {
		site.Current.Links = site.getLinks()
	}
}

// NewLocalSite return local site
func NewLocalSite(contextDir string) (*Site, error) {
	service, err := local.NewService(contextDir)
	if err != nil {
		return nil, err
	}

	site := &Site{
		Name: service.Name,
		Path: service.RootPath,
	}
	site.Storage = service

	err = site.init()
	if err != nil {
		return nil, err
	}

	service.SourcePath = filepath.Join(service.RootPath, strings.Trim(site.Config.Source, "."))
	service.DestinationPath = filepath.Join(service.RootPath, strings.Trim(site.Config.Destination, "."))

	warnPath := site.Storage.GetSourceKey(PrefixLogs, "warn.log")
	errorPath := site.Storage.GetSourceKey(PrefixLogs, "error.log")
	if !site.Storage.IsExist(warnPath) {
		site.Storage.Write(warnPath, []byte{})
	}
	if !site.Storage.IsExist(errorPath) {
		site.Storage.Write(errorPath, []byte{})
	}

	site.logger = log.New()
	site.logger.Formatter = new(log.TextFormatter)
	site.logger.Level = log.WarnLevel
	site.logger.Hooks.Add(lfshook.NewHook(lfshook.PathMap{
		log.WarnLevel:  warnPath,
		log.ErrorLevel: errorPath,
	}))

	for _, lang := range site.Langs {
		site.Current = lang
		site.load()
	}
	return site, nil
}

// NewS3Site returns a new s3 site
func NewS3Site(bucketSource, bucketDestination, owner, name string) (*Site, error) {
	service, err := s3.NewService(bucketSource, bucketDestination, owner, name)
	if err != nil {
		return nil, err
	}

	site := &Site{
		Name: name,
		Path: owner + "/" + name,
	}

	site.Storage = service

	err = site.init()
	if err != nil {
		return nil, err
	}

	for _, lang := range site.Langs {
		site.Current = lang
		site.load()
	}
	return site, nil
}
