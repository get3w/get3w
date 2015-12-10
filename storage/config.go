package storage

import (
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
	return site.Write(site.GetSourceKey(repos.KeyConfig), data)
}
