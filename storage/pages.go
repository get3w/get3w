package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/repos"
)

// GetPages parse SUMMARY.md file and returns pages
func (site *Site) GetPages() []*get3w.Page {
	if site.pages == nil {
		pages := []*get3w.Page{}

		for _, summary := range site.Summaries {
			page := site.getPageBySummary(summary)
			pages = append(pages, page)
		}

		site.pages = pages
	}

	return site.pages
}

// WritePage write content to page file
func (site *Site) WritePage(page *get3w.Page) error {
	ext := getExt(page.Layout)
	data, err := fmatter.Write(ext, page, []byte(page.Template))
	if err != nil {
		return err
	}
	return site.Write(site.GetSourceKey(repos.KeyConfig), data)
}

// DeletePage delete page file
func (site *Site) DeletePage(summary *get3w.PageSummary) error {
	return site.Delete(site.GetSourceKey(summary.Path))
}
