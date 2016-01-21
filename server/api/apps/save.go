package apps

import (
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
	"github.com/mitchellh/mapstructure"
)

// Save app
func Save(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	input := &get3w.AppSaveInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewLocalParser(api.Owner(c), appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	for _, payload := range input.Payloads {
		switch payload.Type {
		case get3w.PayloadTypeConfig:
			if payload.Status == get3w.PayloadStatusModified || payload.Status == get3w.PayloadStatusAdded {
				var config get3w.Config
				err := mapstructure.Decode(payload.Data, &config)
				if err == nil {
					if app.Description == "" && config.Description != "" {
						app.Description = config.Description
					}

					parser.Config = &config
					parser.WriteConfig()
				}
			}

		case get3w.PayloadTypePage:
			if payload.Status == get3w.PayloadStatusModified || payload.Status == get3w.PayloadStatusAdded {
				var page get3w.Page
				err := mapstructure.Decode(payload.Data, &page)
				if err == nil {
					parser.WritePage(&page)
				}
			}

		case get3w.PayloadTypeSection:
			if payload.Status == get3w.PayloadStatusModified || payload.Status == get3w.PayloadStatusAdded {
				var section get3w.Section
				err := mapstructure.Decode(payload.Data, &section)
				if err == nil {
					parser.SaveSection(&section)
				}
			} else if payload.Status == get3w.PayloadStatusRemoved {
				var section get3w.Section
				err := mapstructure.Decode(payload.Data, &section)
				if err == nil {
					parser.DeleteSection(section.Name)
				}
			}

		}
	}

	return c.JSON(http.StatusOK, &get3w.AppSaveOutput{
		LastModified: timeutils.ToString(time.Now()),
	})
}
