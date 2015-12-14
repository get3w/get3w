package storage

import (
	"path/filepath"
	"strings"

	log "github.com/Sirupsen/logrus"
	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/repos"
	"github.com/get3w/get3w/storage/local"
	"github.com/get3w/get3w/storage/s3"
	"github.com/rifflock/lfshook"
	"gopkg.in/yaml.v2"
)

func (site *Site) loadConfig() error {
	var config, sitemap []byte

	if site.IsExist(site.GetSourceKey(repos.KeyGet3W)) {
		data, _ := site.Read(site.GetSourceKey(repos.KeyGet3W))
		config, sitemap = fmatter.ReadRaw(data)
	}
	if len(config) == 0 {
		if site.IsExist(site.GetSourceKey(repos.KeyConfig)) {
			config, _ = site.Read(site.GetSourceKey(repos.KeyConfig))
		}
	}

	site.Config = &get3w.Config{}
	if len(config) > 0 {
		yaml.Unmarshal(config, site.Config)
	}

	if site.Config.TemplateEngine == "" {
		site.Config.TemplateEngine = parser.TemplateEngineLiquid
	}
	if site.Config.LayoutPage == "" {
		site.Config.LayoutPage = "default"
	}
	if site.Config.LayoutPost == "" {
		site.Config.LayoutPost = "post"
	}
	if site.Config.Destination == "" {
		site.Config.Destination = "_site"
	}

	vars := make(map[string]interface{})
	yaml.Unmarshal(config, vars)

	site.Config.All = structs.Map(site.Config)
	for key, val := range vars {
		if _, ok := site.Config.All[key]; !ok {
			site.Config.All[key] = val
		}
	}

	site.Summaries = getSummaries(string(sitemap))

	return nil
}

// NewLocalSite return local site
func NewLocalSite(contextDir string) (*Site, error) {
	service, err := local.NewService(contextDir)
	if err != nil {
		return nil, err
	}

	site := &Site{
		Name:                 service.Name,
		Path:                 service.Path,
		GetSourcePrefix:      service.GetSourcePrefix,
		GetDestinationPrefix: service.GetDestinationPrefix,
		GetSourceKey:         service.GetSourceKey,
		GetDestinationKey:    service.GetDestinationKey,
		Read:                 service.Read,
		Checksum:             service.Checksum,
		Write:                service.Write,
		WriteDestination:     service.WriteDestination,
		Download:             service.Download,
		Rename:               nil,
		CopyToDestination:    service.CopyToDestination,
		Delete:               service.Delete,
		DeleteDestination:    service.DeleteDestination,
		GetFiles:             service.GetFiles,
		GetAllFiles:          service.GetAllFiles,
		IsExist:              service.IsExist,
		DeleteFolder:         service.DeleteFolder,
		NewFolder:            service.NewFolder,
	}

	err = site.loadConfig()
	if err != nil {
		return nil, err
	}

	service.SourcePath = filepath.Join(service.Path, strings.Trim(site.Config.Source, "."))
	service.DestinationPath = filepath.Join(service.Path, strings.Trim(site.Config.Destination, "."))

	warnPath := site.GetSourceKey(repos.PrefixLogs, "warn.log")
	errorPath := site.GetSourceKey(repos.PrefixLogs, "error.log")
	if !site.IsExist(warnPath) {
		site.Write(warnPath, []byte{})
	}
	if !site.IsExist(errorPath) {
		site.Write(errorPath, []byte{})
	}

	site.logger = log.New()
	site.logger.Formatter = new(log.TextFormatter)
	site.logger.Level = log.WarnLevel
	site.logger.Hooks.Add(lfshook.NewHook(lfshook.PathMap{
		log.WarnLevel:  warnPath,
		log.ErrorLevel: errorPath,
	}))

	site.initialization()
	return site, nil
}

func (site *Site) initialization() {
	site.Config.Posts = []*get3w.Post{}
	files, _ := site.GetAllFiles(site.GetSourcePrefix(repos.PrefixPosts))
	for _, file := range files {
		if file.IsDir {
			continue
		}
		post := site.getPost(file)
		if post != nil {
			site.Config.Posts = append(site.Config.Posts, post)
		}
	}
	site.Config.All["posts"] = site.Config.Posts

	if len(site.Summaries) == 0 {
		site.Summaries = site.getSummaries()
	}
}

// NewS3Site returns a new s3 site
func NewS3Site(bucketSource, bucketDestination, owner, name string) (*Site, error) {
	service, err := s3.NewService(bucketSource, bucketDestination, owner, name)
	if err != nil {
		return nil, err
	}

	site := &Site{
		Name:                 name,
		Path:                 owner + "/" + name,
		GetSourcePrefix:      service.GetSourcePrefix,
		GetDestinationPrefix: service.GetDestinationPrefix,
		GetSourceKey:         service.GetSourceKey,
		GetDestinationKey:    service.GetDestinationKey,
		Read:                 service.Read,
		Checksum:             service.Checksum,
		Write:                service.Write,
		WriteDestination:     service.WriteDestination,
		Download:             service.Download,
		Rename:               service.Rename,
		CopyToDestination:    service.CopyToDestination,
		Delete:               service.Delete,
		DeleteDestination:    service.DeleteDestination,
		GetFiles:             service.GetFiles,
		GetAllFiles:          service.GetAllFiles,
		IsExist:              service.IsExist,
		DeleteFolder:         service.DeleteFolder,
		NewFolder:            service.NewFolder,
	}

	err = site.loadConfig()
	if err != nil {
		return nil, err
	}

	site.initialization()
	return site, nil
}
