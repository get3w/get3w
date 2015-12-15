package storage

import (
	log "github.com/Sirupsen/logrus"
	"github.com/get3w/get3w/pkg/fmatter"
)

// WriteConfig write content to config file
func (site *Site) WriteConfig() error {
	links := marshalLink(site.Links)
	data, err := fmatter.Write(site.Config, []byte(links))
	if err != nil {
		return err
	}
	return site.Storage.Write(site.Storage.GetSourceKey(KeyGet3W), data)
}

// LogWarn write content to log file
func (site *Site) LogWarn(templateURL, pageURL, warning string) {
	if site.logger != nil {
		site.logger.WithFields(log.Fields{
			"templateURL": templateURL,
			"pageURL":     pageURL,
		}).Warn(warning)
	}
}

// LogError write content to log file
func (site *Site) LogError(templateURL, pageURL string, err error) {
	if site.logger != nil {
		site.logger.WithFields(log.Fields{
			"templateURL": templateURL,
			"pageURL":     pageURL,
		}).Error(err.Error())
	}
}
