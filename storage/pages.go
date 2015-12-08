package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/repos"
)

// GetPageSummaries get SUMMARY.md file content
func (site *Site) GetPageSummaries() ([]*get3w.PageSummary, error) {
	if site.pageSummaries == nil {
		summaries := []*get3w.PageSummary{}

		data, err := site.Read(site.GetSourceKey(repos.KeySummary))
		if err != nil {
			return nil, err
		}

		summaries = parser.UnmarshalSummary(data)

		site.pageSummaries = summaries
	}

	return site.pageSummaries, nil
}

// GetPages parse SUMMARY.md file and returns pages
func (site *Site) GetPages() ([]*get3w.Page, error) {
	if site.pages == nil {
		pages := []*get3w.Page{}

		summaries, err := site.GetPageSummaries()
		if err != nil {
			return nil, err
		}

		for _, summary := range summaries {
			page := site.getPageBySummary(summary)
			pages = append(pages, page)
		}

		site.pages = pages
	}

	return site.pages, nil
}

func (site *Site) getPageBySummary(summary *get3w.PageSummary) *get3w.Page {
	page := site.GetPage(summary)

	if len(summary.Children) > 0 {
		for _, child := range summary.Children {
			childPage := site.getPageBySummary(child)
			page.Children = append(page.Children, childPage)
		}
	}

	return page
}

// WritePage write content to page file
func (site *Site) WritePage(page *get3w.Page) error {
	pageKey := site.GetSourceKey(page.TemplateURL)
	yaml, err := page.String()
	if err != nil {
		return err
	}
	return site.Write(pageKey, []byte(yaml))
}

// GetPage get page models by pageName
func (site *Site) GetPage(summary *get3w.PageSummary) *get3w.Page {
	data := ""
	if parser.IsExt(summary.TemplateURL) {
		pageKey := site.GetSourceKey(summary.TemplateURL)
		data, _ = site.Read(pageKey)
	}

	return parser.UnmarshalPage(summary, data)
}

// DeletePage delete page file
func (site *Site) DeletePage(summary *get3w.PageSummary) error {
	return site.Delete(site.GetSourceKey(summary.TemplateURL))
}
