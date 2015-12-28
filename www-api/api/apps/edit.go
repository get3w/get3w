package apps

import (
	"net/http"
	"strings"

	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Edit the app.
func Edit(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	var req map[string]interface{}
	err := api.LoadRequestInput(c, &req)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	isUpdateApp := false
	isUpdateAppName := false
	nameOld := app.Name

	for key, v := range req {
		value := v.(string)
		switch key {
		case appDAO.AttrName:
			newName := strings.ToLower(strings.TrimSpace(value))
			if app.Name != newName {
				if !utils.IsAppname(newName) {
					return api.ErrorBadRequest(c, get3w.Error(api.ErrAppnameNotValid))
				}

				exists, err := appDAO.IsNameExists(owner, newName)
				if err != nil {
					return api.ErrorInternal(c, err)
				}
				if exists {
					return api.ErrorBadRequest(c, get3w.Error(api.ErrAppnameExist))
				}
				app.Name = name
				isUpdateApp = true
				isUpdateAppName = true
			}

		case appDAO.AttrURL:
			if app.URL != value {
				app.URL = value
				isUpdateApp = true
			}

		case appDAO.AttrDescription:
			if app.Description != value {
				app.Description = value
				isUpdateApp = true
			}

		case appDAO.AttrTags:
			if app.Tags != value {
				app.Tags = value
				isUpdateApp = true
			}

		}
	}

	if isUpdateAppName {
		parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, owner, nameOld)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		err = parser.Storage.Rename(app.Owner, app.Name, true)
		if err != nil {
			return api.ErrorInternal(c, err)
		}
	}
	if isUpdateApp {
		err = appDAO.Update(app)
		if err != nil {
			return api.ErrorInternal(c, err)
		}
	}

	return c.JSON(http.StatusOK, app)
}
