package storage

import "github.com/get3w/get3w/storage/s3"

// NewS3Site returns a new s3 site
func NewS3Site(bucketSource, bucketPreview, bucketBuild, owner, name string) (*Site, error) {
	service, err := s3.NewService(bucketSource, bucketPreview, bucketBuild, owner, name)
	if err != nil {
		return nil, err
	}

	return &Site{
		Name:          name,
		Read:          service.Read,
		Checksum:      service.Checksum,
		Write:         service.Write,
		WritePreview:  service.WritePreview,
		WriteBuild:    service.WriteBuild,
		Download:      service.Download,
		Rename:        service.Rename,
		Delete:        service.Delete,
		DeletePreview: service.DeletePreview,
		DeleteBuild:   service.DeleteBuild,
		DeleteAll:     service.DeleteAll,
		GetFiles:      service.GetFiles,
		GetAllFiles:   service.GetAllFiles,
		IsExist:       service.IsExist,
	}, nil
}
