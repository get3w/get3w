package storage

import (
	"github.com/get3w/get3w"
	"github.com/mitchellh/mapstructure"
)

// APISave returns true if the file is local only
func (parser *Parser) APISave(payloads []*get3w.SavePayload) error {
	for _, payload := range payloads {
		switch payload.Type {
		case get3w.PayloadTypeConfig:
			if payload.Status == get3w.PayloadStatusModified || payload.Status == get3w.PayloadStatusAdded {
				var config get3w.Config
				if err := mapstructure.Decode(payload.Data, &config); err != nil {
					return err
				}
				parser.Config = &config
				if err := parser.WriteConfig(); err != nil {
					return err
				}
			}

		case get3w.PayloadTypePage:
			if payload.Status == get3w.PayloadStatusModified || payload.Status == get3w.PayloadStatusAdded {
				var page get3w.Page
				if err := mapstructure.Decode(payload.Data, &page); err != nil {
					return err
				}
				if err := parser.WritePage(&page); err != nil {
					return err
				}
			}

		case get3w.PayloadTypeSection:
			if payload.Status == get3w.PayloadStatusModified || payload.Status == get3w.PayloadStatusAdded {
				var section get3w.Section
				if err := mapstructure.Decode(payload.Data, &section); err != nil {
					return err
				}
				if err := parser.saveSection(&section); err != nil {
					return err
				}
			} else if payload.Status == get3w.PayloadStatusRemoved {
				var section get3w.Section
				if err := mapstructure.Decode(payload.Data, &section); err != nil {
					return err
				}
				if err := parser.deleteSection(section.Path); err != nil {
					return err
				}
			}

		}
	}
	return nil
}

// APILoad load resources for each site
func (parser *Parser) APILoad() {
	parser.EachSite(func() {
		parser.LoadSiteParameters()
		parser.LoadSitePosts()
		parser.LoadSitePageSummaries()
		parser.LoadSitePages()
		parser.LoadSiteSectionsFromDir()
		parser.LoadSiteSectionsFromPages(parser.Current.Pages)
		parser.LoadSiteLayouts()
	})
}
