package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/repos"
	"github.com/get3w/get3w/storage/local"
	"github.com/get3w/get3w/storage/s3"
)

func (site *Site) initialization() error {
	// if !site.IsExist(site.GetSourceKey(repos.KeyConfig)) {
	// 	fmt.Printf("WARNNING: Not found 'get3w.md' in the path: '%s'\n", site.Path)
	// 	//return fmt.Errorf("ERROR: Not a get3w repository: '%s'", site.Path)
	// }

	config := &get3w.Config{}

	data, _ := site.Read(site.GetSourceKey(repos.KeyConfig))

	content := fmatter.Read(data, config)
	summaries := getSummaries(string(content))

	site.Config = config
	site.Summaries = summaries

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

	err = site.initialization()
	if err != nil {
		return nil, err
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

	err = site.initialization()
	if err != nil {
		return nil, err
	}

	return site, nil
}
