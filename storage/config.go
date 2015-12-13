package storage

import (
	log "github.com/Sirupsen/logrus"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/repos"
)

// WriteConfig write content to config file
func (site *Site) WriteConfig() error {
	summaries := marshalSummary(site.Summaries)
	data, err := fmatter.Write(site.Config, []byte(summaries))
	if err != nil {
		return err
	}
	return site.Write(site.GetSourceKey(repos.KeyGet3W), data)
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
